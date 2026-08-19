export interface MarketSymbol {
  label: string;
  symbol: string;
}

// Yahoo tickers as supplied — batched into one v7/finance/quote call by the
// /api/ticker-tape route rather than fetched one at a time.
export const GLOBAL_MARKETS: MarketSymbol[] = [
  { label: "S&P 500", symbol: "^GSPC" },
  { label: "Nasdaq", symbol: "^IXIC" },
  { label: "Dow Jones", symbol: "^DJI" },
  { label: "Nikkei 225", symbol: "^N225" },
  { label: "Hang Seng", symbol: "^HSI" },
  { label: "Shanghai", symbol: "000001.SS" },
  { label: "KOSPI", symbol: "^KS11" },
  { label: "FTSE 100", symbol: "^FTSE" },
  { label: "DAX", symbol: "^GDAXI" },
  { label: "CAC 40", symbol: "^FCHI" },
  { label: "Brent Crude", symbol: "BZ=F" },
  { label: "USD/INR", symbol: "INR=X" },
  { label: "US 10Y Yield", symbol: "^TNX" },
  { label: "Nifty 50", symbol: "^NSEI" },
  { label: "Nifty Bank", symbol: "^NSEBANK" },
  { label: "Nifty Fin Services", symbol: "NIFTY_FIN_SERVICE.NS" },
  { label: "Nifty IT", symbol: "^CNXIT" },
  { label: "Nifty Auto", symbol: "^CNXAUTO" },
  { label: "Nifty FMCG", symbol: "^CNXFMCG" },
  { label: "Nifty Pharma", symbol: "^CNXPHARMA" },
  { label: "Nifty Healthcare", symbol: "^CNXHEALTHCARE" },
  { label: "Nifty Metal", symbol: "^CNXMETAL" },
  { label: "Nifty Energy", symbol: "^CNXENERGY" },
  { label: "Nifty Oil & Gas", symbol: "^CNXOILANDGAS" },
  { label: "Nifty Realty", symbol: "^CNXREALTY" },
  { label: "Nifty Media", symbol: "^CNXMEDIA" },
  { label: "Nifty PSU Bank", symbol: "^CNXPSUBANK" },
  { label: "Nifty Pvt Bank", symbol: "^CNXPVTBANK" },
  { label: "Bitcoin", symbol: "BTC-USD" },
  { label: "Ethereum", symbol: "ETH-USD" },
  { label: "Solana", symbol: "SOL-USD" },
  { label: "BNB", symbol: "BNB-USD" },
  { label: "XRP", symbol: "XRP-USD" },
];
