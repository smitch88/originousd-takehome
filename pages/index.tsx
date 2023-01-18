import { useState, useEffect } from "react";

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

const useDefiLlama = ({ chartIds }) => {
  const [projectedAPY, setprojectedAPY] = useState(0);
  const baseURI = "https://yields.llama.fi/chart/";

  useEffect(() => {}, [chartIds]);

  return [projectedAPY];
};

const useOUSD = () => {
  const [total, setTotal] = useState(0);
  const fetchTotalOusd = () =>
    fetch("https://api.originprotocol.com/total-ousd").then(async (res) =>
      setTotal(await res.json())
    );
  useEffect(() => {
    fetchTotalOusd();
  }, []);
  return [total, { onRefresh: fetchTotalOusd }];
};

const Home = () => {
  // const [totalOusd] = useOUSD();

  return (
    <div className="flex flex-col w-full h-full">
      <h1>Simulator</h1>
      {/*<p>{totalOusd}</p>*/}
    </div>
  );
};

export default Home;
