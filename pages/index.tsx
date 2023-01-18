import { useMemo, useState, useEffect } from "react";

/*
Exercise: OUSD strategies allocation simulator
Context:
The OUSD Vault allocates its assets (DAI, USDC, USDT) into strategies
Currently the protocol supports 3 strategies: Compound, Aave, Convex. See the ousd docs
You can check out the current allocations on the analytics page at https://analytics.ousd.com
On a periodic basis, the community analyzes the yields from the strategies and votes for updating the allocations - Essentially deciding what % of each stablecoin should go into what strategy.
To help with those allocation decisions, we built a "simulator" as a spreadsheet
Notice how you can change values in the cells having a yellow background on the APYs sheet.
Notice how the APY from various protocols are dynamically fetched by calling APIs (Click on Extensions > Apps Script) to see the code fetching and refreshing the dynamic data. Important: Apps Script is only visible if you make a copy of the spreadsheet (File > Make a copy) so that you get edit permissions on it.
 */

/*
Main question:
Implement an OUSD assets allocation simulator as a cli script, modeled after the spreadsheet.
Given allocations (what % of stablecoins to allocate to each strategy), it should calculate the projected APY of the OUSD protocol.
You can hardcode APYs for the 3rd party protocols (Compound, Aave, …).

Bonus questions (optional)
Please note: The bonus questions are totally optional and in arbitrary order. They are also fairly independent from each other. Feel free to pick any of them or none!
Bonus 1: Build a basic React.js UI on top of the logic, to allow the user to input the allocations and display the calculated OUSD APY.
Bonus 2: As opposed to hardcoding the APYs for the 3rd party protocols, fetch those dynamically by calling their respective APIs
Bonus 3: As opposed to the user providing the allocations as input, automatically calculate the optimum allocation for the assets in the vault.
Bonus 4: Store all the data in a relational database so that the logic could get scheduled to run as a daily cron-job and the historical daily data (allocations, OUSD APY, 3rd party protocol APYs) would get stored and can then be further analyzed.

 */

const ousdStrategiesEndpoint =
  "https://analytics.ousd.com/api/v1/strategies?structured=true";
const ousdSupplyEndpoint = "https://api.originprotocol.com/total-ousd";
const aaveEndpoint = "https://aave-api-v2.aave.com/data/markets-data";
const compoundEndpoint = "https://api.compound.finance/api/v2/ctoken";

const aaveTokens = {
  ADAI: {
    address: "0x028171bca77440897b824ca71d1c56cac55b68a3",
  },
  AUSDC: {
    address: "0xbcca60bb61934080951369a648fb03df4f96263c",
  },
  AUSDT: {
    address: "0x3ed3b47dd13ec9a98b44e6204a523e766b225811",
  },
};

const compoundTokens = {
  cDAI: {
    address: "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643",
  },
  cUSDC: {
    address: "0x39aa39c021dfbae8fac545936693ac917d5e7563",
  },
  cUSDT: {
    address: "0xf650c3d88d12db855b8bf7d11be6c55a4e07dcc9",
  },
};

const compoundAddresses = [
  compoundTokens.cDAI.address,
  compoundTokens.cUSDC.address,
  compoundTokens.cUSDT.address,
];

const defiLlama = {
  convex3pool: {
    id: "7394f1bc-840a-4ff0-9e87-5e0ef932943a",
  },
  convexLusd3Crv: {
    id: "b61ef013-6391-4cdd-b057-b344ab852088",
  },
  convexOusd3Crv: {
    id: "9e038028-8f56-449f-8410-64683f0c086b",
  },
  morphoAaveDAI: {
    id: "b8bcdf8e-96ed-40ca-a7aa-aa048b9874e5",
  },
  morphoAaveUSDC: {
    id: "325ad2d6-70b1-48d7-a557-c2c99a036f87",
  },
  morphoAaveUSDT: {
    id: "1343a280-7812-4bc3-8f98-d1c37e11d271",
  },
  morphoCompoundDAI: {
    id: "1e6a12f5-687c-4ce6-8416-af38f17954ea",
  },
  morphoCompoundUSDC: {
    id: "b718e8ee-c749-4152-9f3d-e3f9ff2da564",
  },
  morphoCompoundUSDT: {
    id: "6303c3d4-4b56-49ff-9be0-83d4bcdd2574",
  },
};

const toPercent = (value, precision = 2) => (value * 100).toFixed(precision);

const toCurrency = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);

const DEFI_LLAMA_BASE_URI = "https://yields.llama.fi/chart/";

const processAAVE = ({ reserves }) => {
  const aTokens = Object.keys(aaveTokens);
  return reserves.reduce((acc, { symbol, liquidityRate, aIncentivesAPY }) => {
    if (aTokens.includes(symbol)) {
      acc[symbol] = {
        base: Number(liquidityRate),
        reward: Number(aIncentivesAPY || 0),
      };
    }
    return acc;
  }, {});
};

const processCompound = ({ cToken }) => {
  const cTokens = Object.keys(compoundTokens);
  return cToken.reduce((acc, { symbol, supply_rate, comp_supply_apy }) => {
    if (cTokens.includes(symbol)) {
      acc[symbol] = {
        base: Number(supply_rate.value),
        reward: Number(comp_supply_apy.value / 100),
      };
    }
    return acc;
  }, {});
};

const processDefiLlama =
  (pool) =>
  ({ data }) => {
    const { apyBase = 0, apyReward = 0 } = data.pop();
    return {
      [pool]: {
        base: apyBase / 100,
        reward: (apyReward || 0) / 100,
      },
    };
  };

const processStrategies = (data) => {
  return Object.keys(data).reduce((acc, key) => {
    const holdings = data[key]?.holdings;
    Object.keys(holdings).forEach((token) => {
      if (!acc[token]) {
        acc[token] = 0;
      }
      acc[token] += holdings[token];
    });
    return acc;
  }, {});
};

const merge = (data) =>
  data.reduce(
    (acc, item) => ({
      ...acc,
      ...item,
    }),
    {}
  );

const strategies = [
  {
    strategyId: "aavestrat_holding",
    token: "DAI",
    apy: "ADAI",
  },
  {
    strategyId: "aavestrat_holding",
    token: "USDC",
    apy: "AUSDC",
  },
  {
    strategyId: "aavestrat_holding",
    token: "USDT",
    apy: "AUSDT",
  },
  {
    strategyId: "compstrat_holding",
    token: "DAI",
    apy: "cUSDT",
  },
  {
    strategyId: "compstrat_holding",
    token: "USDC",
    apy: "cUSDT",
  },
  {
    strategyId: "compstrat_holding",
    token: "USDT",
    apy: "cUSDT",
  },
  {
    strategyId: "threepoolstrat_holding",
    token: ["DAI", "USDC", "USDT"],
    apy: "convex3pool",
  },
  {
    strategyId: "lusd_metastrat",
    token: ["DAI", "USDC", "USDT"],
    apy: "convexLusd3Crv",
  },
  {
    strategyId: "ousd_metastrat",
    token: ["DAI", "USDC", "USDT"],
    apy: "convexOusd3Crv",
  },
  {
    strategyId: "morpho_aave_strat",
    token: "DAI",
    apy: "morphoAaveDAI",
  },
  {
    strategyId: "morpho_aave_strat",
    token: "USDC",
    apy: "morphoAaveUSDC",
  },
  {
    strategyId: "morpho_aave_strat",
    token: "USDT",
    apy: "morphoAaveUSDT",
  },
  {
    strategyId: "morpho_strat",
    token: "DAI",
    apy: "morphoCompoundDAI",
  },
  {
    strategyId: "morpho_strat",
    token: "USDC",
    apy: "morphoCompoundUSDC",
  },
  {
    strategyId: "morpho_strat",
    token: "USDT",
    apy: "morphoCompoundUSDT",
  },
];

const stables = ["DAI", "USDT", "USDC"];

const useSimulator = () => {
  const [data, setData] = useState(null);

  const [allocations, setAllocations] = useState({
    DAI: {
      aavestrat_holding: 0,
      compstrat_holding: 0,
      threepoolstrat_holding: 0,
      lusd_metastrat: 0,
      ousd_metastrat: 0,
      morpho_aave_strat: 0,
      morpho_strat: 0,
    },
    USDC: {
      aavestrat_holding: 0,
      compstrat_holding: 0,
      threepoolstrat_holding: 0,
      lusd_metastrat: 0,
      ousd_metastrat: 0,
      morpho_aave_strat: 0,
      morpho_strat: 0,
    },
    USDT: {
      aavestrat_holding: 0,
      compstrat_holding: 0,
      threepoolstrat_holding: 0,
      lusd_metastrat: 0,
      ousd_metastrat: 0,
      morpho_aave_strat: 0,
      morpho_strat: 0,
    },
  });

  const [boostMultiplier, setBoostMultiplier] = useState(2.94);

  const fetchOUSDDetails = async () => {
    // Retrieve OUSD
    const totalOusd = await fetch(ousdSupplyEndpoint).then((res) => res.json());
    // Retrieve Current Strategies/Holdings
    const ousdStrategies = await fetch(ousdStrategiesEndpoint)
      .then((res) => res.json())
      .then(({ strategies }) => strategies);

    delete ousdStrategies["vault_holding"];

    const totalHoldings = processStrategies(ousdStrategies);

    return {
      totalOusd,
      totalHoldings,
      ousdStrategies,
      totalStables: stables.reduce(
        (acc, key) => (acc += totalHoldings[key] || 0),
        0
      ),
      holdingsSummary: stables.reduce((acc, token) => {
        acc[token] = totalHoldings[token];
        return acc;
      }, {}),
    };
  };

  const fetchAPYs = async () => {
    return Promise.all([
      // Retrieve AAVE
      fetch(aaveEndpoint)
        .then((res) => res.json())
        .then(processAAVE),
      // Retrieve Compound
      fetch(`${compoundEndpoint}?addresses=${compoundAddresses.join(",")}`)
        .then((res) => res.json())
        .then(processCompound),
      // Retrieve Convex/Morpho
      Promise.all(
        Object.keys(defiLlama).map((pool) => {
          const { id } = defiLlama[pool];
          return fetch(`${DEFI_LLAMA_BASE_URI}${id}`)
            .then((res) => res.json())
            .then(processDefiLlama(pool));
        })
      ).then(merge),
    ]).then(merge);
  };

  useEffect(() => {
    (async function () {
      // Fetch current holdings, ousd information, and current apys
      const [
        { totalStables, holdingsSummary, totalHoldings, ousdStrategies },
        apys,
      ] = await Promise.all([fetchOUSDDetails(), fetchAPYs()]);

      const {
        aavestrat_holding,
        compstrat_holding,
        threepoolstrat_holding,
        lusd_metastrat,
        ousd_metastrat,
        morpho_aave_strat,
        morpho_strat,
      } = ousdStrategies;

      const {
        DAI: ADAI,
        USDC: AUSDC,
        USDT: AUSDT,
      } = aavestrat_holding?.holdings;

      const {
        DAI: cDAI,
        USDC: cUSDC,
        USDT: cUSDT,
      } = compstrat_holding?.holdings;

      const {
        DAI: threePoolDAI,
        USDC: threePoolUSDC,
        USDT: threePoolUSDT,
      } = threepoolstrat_holding?.holdings;

      const {
        DAI: lusdDAI,
        USDC: lusdUSDC,
        USDT: lusdUSDT,
      } = lusd_metastrat?.holdings;

      const {
        DAI: ousdDAI,
        USDC: ousdUSDC,
        USDT: ousdUSDT,
      } = ousd_metastrat?.holdings;

      const {
        DAI: morphoAaveDAI,
        USDC: morphoAaveUSDC,
        USDT: morphoAaveUSDT,
      } = morpho_aave_strat?.holdings;

      const {
        DAI: morphoDAI,
        USDC: morphoUSDC,
        USDT: morphoUSDT,
      } = morpho_strat?.holdings;

      const totalDAI = totalHoldings.DAI;
      const totalUSDC = totalHoldings.USDC;
      const totalUSDT = totalHoldings.USDT;

      // Set baseline allocations
      setAllocations({
        DAI: {
          aavestrat_holding: ADAI / totalDAI,
          compstrat_holding: cDAI / totalDAI,
          threepoolstrat_holding: threePoolDAI / totalDAI,
          lusd_metastrat: lusdDAI / totalDAI,
          ousd_metastrat: ousdDAI / totalDAI,
          morpho_aave_strat: morphoAaveDAI / totalDAI,
          morpho_strat: morphoDAI / totalDAI,
        },
        USDC: {
          aavestrat_holding: AUSDC / totalUSDC,
          compstrat_holding: cUSDC / totalUSDC,
          threepoolstrat_holding: threePoolUSDC / totalUSDC,
          lusd_metastrat: lusdUSDC / totalUSDC,
          ousd_metastrat: ousdUSDC / totalUSDC,
          morpho_aave_strat: morphoAaveUSDC / totalUSDC,
          morpho_strat: morphoUSDC / totalUSDC,
        },
        USDT: {
          aavestrat_holding: AUSDT / totalUSDT,
          compstrat_holding: cUSDT / totalUSDT,
          threepoolstrat_holding: threePoolUSDT / totalUSDT,
          lusd_metastrat: lusdUSDT / totalUSDT,
          ousd_metastrat: ousdUSDT / totalUSDT,
          morpho_aave_strat: morphoAaveUSDT / totalUSDT,
          morpho_strat: morphoUSDT / totalUSDT,
        },
      });

      // Determine strategy outcome
      const outcome = strategies?.map(({ strategyId, token, apy }) => {
        if (!ousdStrategies || !ousdStrategies[strategyId] || !apys[apy]) {
          return null;
        }

        const { name } = ousdStrategies[strategyId];

        let allocation = 0;
        let total = 0;

        if (Array.isArray(token)) {
          for (let i = 0; i < token.length; i++) {
            const currentToken = token[i];
            allocation +=
              (allocations[currentToken][strategyId] *
                totalHoldings[currentToken]) /
              totalStables;
            total += holdingsSummary[currentToken];
          }
        } else {
          allocation =
            (allocations[token][strategyId] * totalHoldings[token]) /
            totalStables;
          ({ total } = holdingsSummary[token]);
        }
        const { base, reward } = apys[apy];
        const strategy = base + reward;
        const boosted = strategy * boostMultiplier;
        const weighted = allocation * boosted;
        return {
          name,
          total,
          allocation,
          allocationAmount: allocation * totalStables,
          base,
          reward,
          strategy,
          boosted,
          weighted,
          token,
        };
      });

      const calculatedAPY = outcome.reduce(
        (acc, item) => (acc += item?.weighted || 0),
        0
      );

      setData({
        outcome,
        calculatedAPY,
        totalStables,
        holdingsSummary,
        totalHoldings,
        ousdStrategies,
        apys,
      });
    })();
  }, [JSON.stringify(allocations), boostMultiplier]);

  const onChangeAllocation = (token, strategy, percent) => {
    setAllocations((prev) => ({
      ...prev,
      [token]: {
        ...prev[token],
        [strategy]: percent,
      },
    }));
  };

  const onChangeBoostMultiplier = (boostValue) => {
    setBoostMultiplier(parseFloat(boostValue));
  };

  return [
    {
      ...data,
      allocations,
      boostMultiplier,
    },
    {
      onChangeAllocation,
      onChangeBoostMultiplier,
    },
  ];
};

const AllocationsTable = ({
  allocations,
  holdingsSummary,
  totalStables,
  onChange,
}) => {
  const summary = Object.keys(allocations || {}).reduce(
    (acc, token) => {
      const total = holdingsSummary?.[token];
      const {
        aavestrat_holding,
        compstrat_holding,
        threepoolstrat_holding,
        lusd_metastrat,
        ousd_metastrat,
        morpho_aave_strat,
        morpho_strat,
      } = allocations[token];

      acc.percentHoldings += total / totalStables;
      acc.totalHoldings += total;
      acc.aavestrat_holding += aavestrat_holding;
      acc.compstrat_holding += compstrat_holding;
      acc.threepoolstrat_holding += threepoolstrat_holding;
      acc.lusd_metastrat += lusd_metastrat;
      acc.ousd_metastrat += ousd_metastrat;
      acc.morpho_aave_strat += morpho_aave_strat;
      acc.morpho_strat += morpho_strat;

      return acc;
    },
    {
      percentHoldings: 0,
      totalHoldings: 0,
      aavestrat_holding: 0,
      compstrat_holding: 0,
      threepoolstrat_holding: 0,
      lusd_metastrat: 0,
      ousd_metastrat: 0,
      morpho_aave_strat: 0,
      morpho_strat: 0,
    }
  );

  return (
    <table className="table-auto">
      <thead>
        <tr>
          <th className="text-left">Token</th>
          <th className="text-left">Holdings</th>
          <th className="text-left">% Holdings</th>
          <th className="text-left">AAVE</th>
          <th className="text-left">Compound</th>
          <th className="text-left">Convex 3pool</th>
          <th className="text-left">Convex LUSD</th>
          <th className="text-left">Convex OUSD</th>
          <th className="text-left">Morpho Aave</th>
          <th className="text-left">Morpho Compound</th>
        </tr>
      </thead>
      <tbody>
        {Object.keys(allocations || {})
          .sort()
          .map((token) => {
            const total = holdingsSummary?.[token];
            const {
              aavestrat_holding,
              compstrat_holding,
              threepoolstrat_holding,
              lusd_metastrat,
              ousd_metastrat,
              morpho_aave_strat,
              morpho_strat,
            } = allocations[token];
            return (
              <tr key={token}>
                <td>{token}</td>
                <td>{toCurrency(total || 0)}</td>
                <td>{toPercent(total / totalStables || 0)}%</td>
                <td>
                  <input
                    className="bg-[#fff2cc] px-2 border border-1 w-[80px] text-right"
                    type="number"
                    value={aavestrat_holding * 100}
                    onChange={(e) => {
                      onChange(
                        token,
                        "aavestrat_holding",
                        parseFloat(e.target.value / 100)
                      );
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bg-[#fff2cc] px-2 border border-1 w-[80px] text-right"
                    type="number"
                    value={compstrat_holding * 100}
                    onChange={(e) => {
                      onChange(
                        token,
                        "compstrat_holding",
                        parseFloat(e.target.value / 100)
                      );
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bg-[#fff2cc] px-2 border border-1 w-[80px] text-right"
                    type="number"
                    value={threepoolstrat_holding * 100}
                    onChange={(e) => {
                      onChange(
                        token,
                        "threepoolstrat_holding",
                        parseFloat(e.target.value / 100)
                      );
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bg-[#fff2cc] px-2 border border-1 w-[80px] text-right"
                    type="number"
                    value={lusd_metastrat * 100}
                    onChange={(e) => {
                      onChange(
                        token,
                        "lusd_metastrat",
                        parseFloat(e.target.value / 100)
                      );
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bg-[#fff2cc] px-2 border border-1 w-[80px] text-right"
                    type="number"
                    value={ousd_metastrat * 100}
                    onChange={(e) => {
                      onChange(
                        token,
                        "ousd_metastrat",
                        parseFloat(e.target.value / 100)
                      );
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bg-[#fff2cc] px-2 border border-1 w-[80px] text-right"
                    type="number"
                    value={morpho_aave_strat * 100}
                    onChange={(e) => {
                      onChange(
                        token,
                        "morpho_aave_strat",
                        parseFloat(e.target.value / 100)
                      );
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bg-[#fff2cc] px-2 border border-1 w-[80px] text-right"
                    type="number"
                    value={morpho_strat * 100}
                    onChange={(e) => {
                      onChange(
                        token,
                        "morpho_strat",
                        parseFloat(e.target.value / 100)
                      );
                    }}
                  />
                </td>
              </tr>
            );
          })}
      </tbody>
      <tfoot className="bg-[#eeeeee] w-full h-[40px] border border-1 text-left">
        <tr>
          <td />
          <td>{toCurrency(summary.totalHoldings || 0)}</td>
          <td colSpan={8}>{toPercent(summary.percentHoldings || 0)}%</td>
        </tr>
      </tfoot>
    </table>
  );
};

const StrategyTable = ({ outcome }) => {
  const summary = useMemo(
    () =>
      outcome?.reduce(
        (acc, item) => {
          acc.allocation += Number(item?.allocation || 0);
          acc.allocationAmount += Number(item?.allocationAmount || 0);
          acc.base += Number(item?.base || 0);
          acc.reward += Number(item?.reward || 0);
          acc.strategy += Number(item?.strategy || 0);
          acc.boosted += Number(item?.boosted || 0);
          acc.weighted += Number(item?.weighted || 0);
          return acc;
        },
        {
          allocation: 0,
          allocationAmount: 0,
          base: 0,
          reward: 0,
          strategy: 0,
          boosted: 0,
          weighted: 0,
        }
      ),
    [JSON.stringify(outcome)]
  );

  return !outcome ? (
    <span>Loading...</span>
  ) : (
    <table className="table-auto">
      <thead>
        <tr>
          <th className="text-left">Strategy</th>
          <th className="text-center">% Allocation</th>
          <th className="text-center">Amount</th>
          <th className="text-center">Base APY</th>
          <th className="text-center">Reward APY</th>
          <th className="text-center">Strategy APY</th>
          <th className="text-center">Boosted APY</th>
          <th className="text-center">Weighted APY</th>
        </tr>
      </thead>
      <tbody>
        {outcome?.map(
          ({
            name,
            allocation,
            allocationAmount,
            base,
            reward,
            strategy,
            boosted,
            weighted,
            token,
          }) => {
            const display = `${name} ${Array.isArray(token) ? "" : token}`;
            return (
              <tr key={display}>
                <td>{display}</td>
                <td className="bg-[#d9ead3] text-center">
                  {toPercent(allocation)}%
                </td>
                <td className="text-center">{toCurrency(allocationAmount)}</td>
                <td className="text-center">{toPercent(base)}%</td>
                <td className="text-center">{toPercent(reward)}%</td>
                <td className="text-center">{toPercent(strategy)}%</td>
                <td className="text-center">{toPercent(boosted)}%</td>
                <td className="text-center">{toPercent(weighted)}%</td>
              </tr>
            );
          }
        )}
      </tbody>
      <tfoot className="bg-[#eeeeee] w-full h-[40px] border border-1">
        <tr>
          <td />
          <td className="text-center">{toPercent(summary?.allocation)}%</td>
          <td className="text-center">
            {toCurrency(summary?.allocationAmount)}
          </td>
        </tr>
      </tfoot>
    </table>
  );
};

const Home = () => {
  const [data, { onChangeAllocation, onChangeBoostMultiplier }] =
    useSimulator();

  const isLoading = !data;

  const {
    allocations,
    boostMultiplier,
    holdingsSummary,
    totalStables,
    outcome,
    calculatedAPY,
  } = data || {};

  return isLoading ? (
    <div className="flex flex-col h-[100vh] w-full items-center justify-center">
      <span className="font-black text-2xl">Loading...</span>
    </div>
  ) : (
    <div className="flex flex-col w-full h-full p-4 pb-10">
      <h1 className="text-2xl font-black">Simulator</h1>
      <hr />
      <div className="flex flex-col w-full py-4">
        <AllocationsTable
          allocations={allocations}
          holdingsSummary={holdingsSummary}
          totalStables={totalStables}
          onChange={onChangeAllocation}
        />
      </div>
      <div className="flex flex-row items-center w-full space-x-6 h-[60px]">
        <h3 className="text-2xl font-black">Strategy</h3>
        <div className="flex flex-col">
          <label className="text-xxs uppercase font-black">Boost Multi</label>
          <input
            className="bg-[#fff2cc] px-2 border border-1 w-[80px] text-right"
            type="number"
            value={boostMultiplier}
            onChange={(e) => {
              onChangeBoostMultiplier(e.target.value);
            }}
          />
        </div>
      </div>
      <hr />
      <div className="flex flex-col w-full py-4">
        <StrategyTable outcome={outcome} />
      </div>
      <h3 className="text-2xl font-black">
        Calculated APY: {toPercent(calculatedAPY || 0)}%
      </h3>
    </div>
  );
};

export default Home;
