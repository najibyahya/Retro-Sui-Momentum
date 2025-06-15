import axios from 'axios';
import { CONFIG } from './config.js';

export class PriceMonitor {
  constructor() {
    this.prices = { 
      SUI_USD: CONFIG.CURRENT_PRICES.SUI_USD,
      USDC_USD: 1.00,
      volatility: 0,
      lastUpdated: 0,
      source: 'Default'
    };
    this.priceHistory = [];
    this.isMonitoring = false;
    this.callbacks = [];
    this.errorCount = 0;
    this.maxErrors = 5;
  }

  async startMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    console.log('📊 Starting real-time price monitoring...');
    
    await this.updatePrices();
    
    this.monitorInterval = setInterval(async () => {
      await this.updatePrices();
    }, CONFIG.PRICE_UPDATE_INTERVAL);
  }

  stopMonitoring() {
    this.isMonitoring = false;
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }
    console.log('🛑 Price monitoring stopped');
  }

  async updatePrices() {
    try {
      const newPrices = await this.fetchMultiSourcePrices();
      
      if (newPrices.SUI_USD && newPrices.SUI_USD > 0) {
        const oldPrice = this.prices.SUI_USD;
        const priceChange = oldPrice > 0 ? (newPrices.SUI_USD - oldPrice) / oldPrice : 0;
        
        this.prices = { 
          ...this.prices, 
          ...newPrices, 
          lastUpdated: Date.now() 
        };
        
        this.updateVolatility(priceChange);
        
        this.priceHistory.push({
          timestamp: Date.now(),
          price: newPrices.SUI_USD,
          change: priceChange,
          volatility: this.prices.volatility
        });
        
        if (this.priceHistory.length > 100) {
          this.priceHistory.shift();
        }
        
        this.errorCount = 0;
        
        if (Math.abs(priceChange) > CONFIG.PRICE_CHANGE_THRESHOLD) {
          this.triggerCallbacks(priceChange);
        }
        
        const changePercent = (priceChange * 100).toFixed(2);
        const changeSymbol = priceChange > 0 ? '📈' : priceChange < 0 ? '📉' : '➡️';
        console.log(`${changeSymbol} SUI: $${newPrices.SUI_USD.toFixed(4)} (${changePercent}%) [${newPrices.source}]`);
      }
      
    } catch (error) {
      this.errorCount++;
      console.error(`❌ Price update error (${this.errorCount}/${this.maxErrors}):`, error.message);
      
      if (this.errorCount >= this.maxErrors) {
        console.log('⚠️ Too many price update errors, using cached prices');
        this.errorCount = 0; 
      }
    }
  }

  async fetchMultiSourcePrices() {
    const prices = {};
    
    try {
      const cgResponse = await axios.get(CONFIG.PRICE_APIS.COINGECKO, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Momentum-Bot/1.0'
        }
      });
      
      if (cgResponse.data?.sui?.usd) {
        prices.SUI_USD = cgResponse.data.sui.usd;
        prices.source = 'CoinGecko';
        return prices;
      }
    } catch (error) {
      console.log('⚠️ CoinGecko API error:', error.message);
    }

    try {
      const binanceResponse = await axios.get(CONFIG.PRICE_APIS.BINANCE, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Momentum-Bot/1.0'
        }
      });
      
      if (binanceResponse.data?.price) {
        prices.SUI_USD = parseFloat(binanceResponse.data.price);
        prices.source = 'Binance';
        return prices;
      }
    } catch (error) {
      console.log('⚠️ Binance API error:', error.message);
    }

    try {
      const krakenResponse = await axios.get(CONFIG.PRICE_APIS.KRAKEN, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Momentum-Bot/1.0'
        }
      });
      
      const krakenData = krakenResponse.data?.result?.SUIUSD;
      if (krakenData?.c?.[0]) {
        prices.SUI_USD = parseFloat(krakenData.c[0]);
        prices.source = 'Kraken';
        return prices;
      }
    } catch (error) {
      console.log('⚠️ Kraken API error:', error.message);
    }

    if (!prices.SUI_USD) {
      prices.SUI_USD = this.prices.SUI_USD;
      prices.source = 'Cached';
    }
    
    return prices;
  }

  updateVolatility(priceChange) {
    const recentChanges = this.priceHistory
      .slice(-10)
      .map(record => Math.abs(record.change || 0));
    
    if (recentChanges.length > 0) {
      this.prices.volatility = recentChanges.reduce((a, b) => a + b) / recentChanges.length;
    } else {
      this.prices.volatility = Math.abs(priceChange);
    }
  }

  onPriceChange(callback) {
    if (typeof callback === 'function') {
      this.callbacks.push(callback);
    }
  }

  triggerCallbacks(priceChange) {
    this.callbacks.forEach(callback => {
      try {
        callback(priceChange, this.prices);
      } catch (error) {
        console.error('Price change callback error:', error);
      }
    });
  }

  getMarketSentiment() {
    if (this.priceHistory.length < 5) return 'NEUTRAL';
    
    const recentChanges = this.priceHistory.slice(-5);
    const avgChange = recentChanges.reduce((sum, record) => sum + (record.change || 0), 0) / recentChanges.length;
    
    if (avgChange > CONFIG.BULL_MARKET_THRESHOLD) return 'BULL';
    if (avgChange < CONFIG.BEAR_MARKET_THRESHOLD) return 'BEAR';
    return 'NEUTRAL';
  }

  getDynamicSlippage() {
    const baseSlippage = CONFIG.MIN_SLIPPAGE;
    const volatilityMultiplier = Math.min((this.prices.volatility || 0) * 10, 5);
    const dynamicSlippage = baseSlippage + (volatilityMultiplier * baseSlippage);
    
    return Math.min(dynamicSlippage, CONFIG.MAX_SLIPPAGE);
  }

  getSuggestedTradeSize(baseAmount) {
    const sentiment = this.getMarketSentiment();
    
    switch (sentiment) {
      case 'BULL':
        return Math.floor(baseAmount * 1.5);
      case 'BEAR':
        return Math.floor(baseAmount * 0.5);
      default:
        return baseAmount;
    }
  }

  getPriceStats() {
    if (this.priceHistory.length === 0) return null;
    
    const prices = this.priceHistory.map(h => h.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const avg = prices.reduce((a, b) => a + b) / prices.length;
    
    return {
      current: this.prices.SUI_USD,
      min,
      max,
      avg,
      volatility: this.prices.volatility,
      source: this.prices.source,
      lastUpdated: new Date(this.prices.lastUpdated).toLocaleString()
    };
  }
}
