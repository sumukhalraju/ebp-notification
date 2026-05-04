declare module "@mathieuc/tradingview" {
  class Client {
    Session: {
      Chart: new () => Chart;
    };
    constructor();
    end(): void;
  }

  class Chart {
    onUpdate(callback: () => void): void;
    onError(callback: (error: unknown) => void): void;
    setMarket(symbol: string, options: { timeframe: string; range: number }): void;
    delete(): void;
    periods?: unknown;
  }

  const TradingView: {
    Client: typeof Client;
  };

  export default TradingView;
}
