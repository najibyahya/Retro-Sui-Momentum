import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

export const CONFIG = {
  RPC_URL: process.env.SUI_RPC_URL || 'https://fullnode.mainnet.sui.io',
  SLIPPAGE_TOLERANCE: parseFloat(process.env.SLIPPAGE_TOLERANCE) || 0.005,
  MIN_SWAP_AMOUNT: parseInt(process.env.MIN_SWAP_AMOUNT) || 10000000,
  MAX_SWAP_AMOUNT: parseInt(process.env.MAX_SWAP_AMOUNT) || 1000000000,
  SWAP_INTERVAL: parseInt(process.env.SWAP_INTERVAL) || 45000,
  

  MOMENTUM_PACKAGE_ID: "0x70285592c97965e811e0c6f98dccc3a9c2b4ad854b3594faab9597ada267b860",
  SUI_USDC_MOMENTUM_POOL: "0x455cf8d2ac91e7cb883f515874af750ed3cd18195c970b7a2d46235ac2b0c388",
  SLIPPAGE_CHECK_PACKAGE: "0x8add2f0f8bc9748687639d7eb59b2172ba09a0172d9e63c029e23a7dbdb6abe6",
  
  CLOCK_OBJECT: "0x0000000000000000000000000000000000000000000000000000000000000006",
  
 
  SUI_TYPE: "0x2::sui::SUI",
  USDC_TYPE: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
  
  DECIMALS: {
    SUI: 9,
    USDC: 6
  },

  PRICE_APIS: {
    COINGECKO: "https://api.coingecko.com/api/v3/simple/price?ids=sui&vs_currencies=usd",
    BINANCE: "https://api.binance.com/api/v3/ticker/price?symbol=SUIUSDT"
  },

  PRICE_UPDATE_INTERVAL: parseInt(process.env.PRICE_UPDATE_INTERVAL) || 10000,
  PRICE_CHANGE_THRESHOLD: parseFloat(process.env.PRICE_CHANGE_THRESHOLD) || 0.02,
  
  BULL_MARKET_THRESHOLD: parseFloat(process.env.BULL_MARKET_THRESHOLD) || 0.05,
  BEAR_MARKET_THRESHOLD: parseFloat(process.env.BEAR_MARKET_THRESHOLD) || -0.03,
  
  MIN_SLIPPAGE: parseFloat(process.env.MIN_SLIPPAGE) || 0.001,
  MAX_SLIPPAGE: parseFloat(process.env.MAX_SLIPPAGE) || 0.01,
  
  CURRENT_PRICES: {
    SUI_USD: 3.25,
    USDC_USD: 1.00,
    volatility: 0,
    lastUpdated: 0
  }
};

export function loadPrivateKey() {
  try {
    const privateKey = fs.readFileSync('privkey.txt', 'utf8').trim();
    if (!privateKey) {
      throw new Error('Private key tidak ditemukan di privkey.txt');
    }
    return privateKey;
  } catch (error) {
    console.error('Error membaca private key:', error.message);
    process.exit(1);
  }
}

export function validateConfig() {
  console.log('Configuration validated - Using EXACT Momentum Protocol');
  console.log(`Package: ${CONFIG.MOMENTUM_PACKAGE_ID}`);
  console.log(`Pool: ${CONFIG.SUI_USDC_MOMENTUM_POOL}`);
  console.log(`Slippage Check: ${CONFIG.SLIPPAGE_CHECK_PACKAGE}`);
}
