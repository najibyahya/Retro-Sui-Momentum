import { Transaction } from '@mysten/sui/transactions';
import { CONFIG } from './config.js';

export class MomentumSwap {
  constructor(suiClient, signer, priceMonitor = null) {
    this.client = suiClient;
    this.signer = signer;
    this.priceMonitor = priceMonitor;
    this.swapCount = 0;

   
    this.PACKAGE_ID = "0xc84b1ef2ac2ba5c3018e2b8c956ba5d0391e0e46d1daa1926d5a99a6a42526b4";
    this.POOL_ID = "0x455cf8d2ac91e7cb883f515874af750ed3cd18195c970b7a2d46235ac2b0c388";
    this.CLOCK_ID = "0x0000000000000000000000000000000000000000000000000000000000000006";
    this.POOL_CONFIG_ID = "0x2375a0b1ec12010aaea3b2545acfa2ad34cfbba03ce4b59f4c39e1e25eed1b2a";
    this.SUI_TYPE = "0x2::sui::SUI";
    this.USDC_TYPE = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
  }

  async getQuote(fromToken, toToken, amount) {
    try {
      if (this.priceMonitor && this.priceMonitor.prices.SUI_USD > 0) {
        return await this.getRealTimeQuote(fromToken, toToken, amount);
      }
      return await this.getFallbackQuote(fromToken, toToken, amount);
    } catch (error) {
      return await this.getFallbackQuote(fromToken, toToken, amount);
    }
  }

  async getRealTimeQuote(fromToken, toToken, amount) {
    const currentPrice = this.priceMonitor.prices.SUI_USD;
    if (fromToken === this.SUI_TYPE && toToken === this.USDC_TYPE) {
      const suiAmount = amount / 1e9;
      const usdcAmount = suiAmount * currentPrice;
      const usdcUnits = Math.floor(usdcAmount * 1e6);
      const fee = Math.floor(usdcUnits * 0.003);
      return {
        amountOut: usdcUnits - fee,
        fee: fee,
        priceImpact: 0.001,
        route: 'Momentum Protocol',
        currentPrice: currentPrice,
        feeRate: 0.003
      };
    }
    if (fromToken === this.USDC_TYPE && toToken === this.SUI_TYPE) {
      const usdcAmount = amount / 1e6;
      const suiAmount = usdcAmount / currentPrice;
      const suiUnits = Math.floor(suiAmount * 1e9);
      const fee = Math.floor(suiUnits * 0.003);
      return {
        amountOut: suiUnits - fee,
        fee: fee,
        priceImpact: 0.001,
        route: 'Momentum Protocol',
        currentPrice: currentPrice,
        feeRate: 0.003
      };
    }
    return null;
  }

  async getFallbackQuote(fromToken, toToken, amount) {
    if (fromToken === this.SUI_TYPE && toToken === this.USDC_TYPE) {
      const rate = 0.00357794;
      const amountOut = Math.floor(amount * rate);
      const fee = Math.floor(amount * 0.0016);
      return {
        amountOut: amountOut - fee,
        fee: fee,
        priceImpact: 0.001,
        route: 'Momentum Protocol',
        feeRate: 0.0016
      };
    }
    if (fromToken === this.USDC_TYPE && toToken === this.SUI_TYPE) {
      const rate = 279.4; 
      const amountOut = Math.floor(amount * rate);
      const fee = Math.floor(amount * 0.0016);
      return {
        amountOut: amountOut - fee,
        fee: fee,
        priceImpact: 0.001,
        route: 'Momentum Protocol',
        feeRate: 0.0016
      };
    }
    return null;
  }

  async executeSwap(fromToken, toToken, amountIn, minAmountOut) {
    try {
      this.swapCount++;
      console.log(`🚀 Executing Momentum Swap #${this.swapCount}`);
      if (fromToken === this.SUI_TYPE && toToken === this.USDC_TYPE) {
        return await this.executeSuiToUsdcSwap(amountIn, minAmountOut);
      } else if (fromToken === this.USDC_TYPE && toToken === this.SUI_TYPE) {
        return await this.executeUsdcToSuiSwap(amountIn, minAmountOut);
      } else {
        throw new Error(`Unsupported swap pair: ${fromToken} -> ${toToken}`);
      }
    } catch (error) {
      console.error('Error executing Momentum swap:', error);
      throw error;
    }
  }

  async executeSuiToUsdcSwap(amountIn, minAmountOut) {
    const tx = new Transaction();
    const address = this.signer.getPublicKey().toSuiAddress();
    try {
      const validAmountIn = amountIn.toString();
      const sqrtPriceLimit = "4295048017";
      const isSwapXToY = true;
      const useFlashSwap = true;
      const [gasCoin] = tx.splitCoins(tx.gas, [validAmountIn]);
      const [suiBalance, usdcBalance, receipt] = tx.moveCall({
        target: `${this.PACKAGE_ID}::trade::flash_swap`,
        typeArguments: [this.SUI_TYPE, this.USDC_TYPE],
        arguments: [
          tx.object(this.POOL_ID),
          tx.pure.bool(isSwapXToY),
          tx.pure.bool(useFlashSwap),
          tx.pure.u64(validAmountIn),
          tx.pure.u128(sqrtPriceLimit),
          tx.object(this.CLOCK_ID),
          tx.object(this.POOL_CONFIG_ID),
        ],
      });
      tx.moveCall({
        target: "0x2::balance::destroy_zero",
        typeArguments: [this.SUI_TYPE],
        arguments: [suiBalance],
      });
      const zeroUsdc = tx.moveCall({
        target: "0x2::coin::zero",
        typeArguments: [this.USDC_TYPE],
        arguments: [],
      });
      tx.moveCall({
        target: `${this.PACKAGE_ID}::trade::swap_receipt_debts`,
        arguments: [receipt],
      });
      const repaySuiBalance = tx.moveCall({
        target: "0x2::coin::into_balance",
        typeArguments: [this.SUI_TYPE],
        arguments: [gasCoin],
      });
      const repayUsdcBalance = tx.moveCall({
        target: "0x2::coin::into_balance",
        typeArguments: [this.USDC_TYPE],
        arguments: [zeroUsdc],
      });
      tx.moveCall({
        target: `${this.PACKAGE_ID}::trade::repay_flash_swap`,
        typeArguments: [this.SUI_TYPE, this.USDC_TYPE],
        arguments: [
          tx.object(this.POOL_ID),
          receipt,
          repaySuiBalance,
          repayUsdcBalance,
          tx.object(this.POOL_CONFIG_ID),
        ],
      });
      tx.moveCall({
        target: "0x8add2f0f8bc9748687639d7eb59b2172ba09a0172d9e63c029e23a7dbdb6abe6::slippage_check::assert_slippage",
        typeArguments: [this.SUI_TYPE, this.USDC_TYPE],
        arguments: [
          tx.object(this.POOL_ID),
          tx.pure.u128(sqrtPriceLimit),
          tx.pure.bool(isSwapXToY),
        ],
      });
      const usdcCoin = tx.moveCall({
        target: "0x2::coin::from_balance",
        typeArguments: [this.USDC_TYPE],
        arguments: [usdcBalance],
      });
      tx.transferObjects([usdcCoin], address);
      return await this.executeFinalTransaction(tx);
    } catch (error) {
      console.error('Error in SUI->USDC swap:', error);
      throw error;
    }
  }

  async executeUsdcToSuiSwap(amountIn, minAmountOut) {
    const tx = new Transaction();
    const address = this.signer.getPublicKey().toSuiAddress();
    try {
      const validAmountIn = amountIn.toString();
      const sqrtPriceLimit = "79226673515401279992447579050";
      const isSwapXToY = false;
      const useFlashSwap = true;
      const usdcCoins = await this.client.getCoins({
        owner: address,
        coinType: this.USDC_TYPE,
      });
      if (!usdcCoins.data.length) {
        throw new Error("No USDC coins found in wallet!");
      }
      let mergedUsdcCoin = tx.object(usdcCoins.data[0].coinObjectId);
      if (usdcCoins.data.length > 1) {
        const otherCoins = usdcCoins.data.slice(1).map(coin => tx.object(coin.coinObjectId));
        tx.mergeCoins(mergedUsdcCoin, otherCoins);
      }
      const [splitUsdcCoin] = tx.splitCoins(mergedUsdcCoin, [validAmountIn]);
      const [suiBalance, usdcBalance, receipt] = tx.moveCall({
        target: `${this.PACKAGE_ID}::trade::flash_swap`,
        typeArguments: [this.SUI_TYPE, this.USDC_TYPE],
        arguments: [
          tx.object(this.POOL_ID),
          tx.pure.bool(isSwapXToY),
          tx.pure.bool(useFlashSwap),
          tx.pure.u64(validAmountIn),
          tx.pure.u128(sqrtPriceLimit),
          tx.object(this.CLOCK_ID),
          tx.object(this.POOL_CONFIG_ID),
        ],
      });
      tx.moveCall({
        target: "0x2::balance::destroy_zero",
        typeArguments: [this.USDC_TYPE],
        arguments: [usdcBalance],
      });
      const zeroSui = tx.moveCall({
        target: "0x2::coin::zero",
        typeArguments: [this.SUI_TYPE],
        arguments: [],
      });
      tx.moveCall({
        target: `${this.PACKAGE_ID}::trade::swap_receipt_debts`,
        arguments: [receipt],
      });
      const repayUsdcBalance = tx.moveCall({
        target: "0x2::coin::into_balance",
        typeArguments: [this.USDC_TYPE],
        arguments: [splitUsdcCoin],
      });
      const repaySuiBalance = tx.moveCall({
        target: "0x2::coin::into_balance",
        typeArguments: [this.SUI_TYPE],
        arguments: [zeroSui],
      });
      tx.moveCall({
        target: `${this.PACKAGE_ID}::trade::repay_flash_swap`,
        typeArguments: [this.SUI_TYPE, this.USDC_TYPE],
        arguments: [
          tx.object(this.POOL_ID),
          receipt,
          repaySuiBalance,
          repayUsdcBalance,
          tx.object(this.POOL_CONFIG_ID),
        ],
      });
      tx.moveCall({
        target: "0x8add2f0f8bc9748687639d7eb59b2172ba09a0172d9e63c029e23a7dbdb6abe6::slippage_check::assert_slippage",
        typeArguments: [this.SUI_TYPE, this.USDC_TYPE],
        arguments: [
          tx.object(this.POOL_ID),
          tx.pure.u128(sqrtPriceLimit),
          tx.pure.bool(isSwapXToY),
        ],
      });
      const suiCoin = tx.moveCall({
        target: "0x2::coin::from_balance",
        typeArguments: [this.SUI_TYPE],
        arguments: [suiBalance],
      });
      tx.transferObjects([suiCoin], address);
      return await this.executeFinalTransaction(tx);
    } catch (error) {
      console.error('Error in USDC->SUI swap:', error);
      throw error;
    }
  }

  async executeFinalTransaction(tx) {
    try {
      console.log('📤 Executing Momentum transaction...');
      tx.setGasBudget(15000000);
      const result = await this.client.signAndExecuteTransaction({
        signer: this.signer,
        transaction: tx,
        options: {
          showEffects: true,
          showObjectChanges: true,
          showBalanceChanges: true,
          showEvents: true
        }
      });
      if (result.effects?.status?.status === 'success') {
        console.log(`✅ Transaction executed: ${result.digest}`);
        console.log(`🔗 Transaction: https://suiscan.xyz/mainnet/tx/${result.digest}`);
        if (result.balanceChanges) {
          console.log('💰 Balance Changes:');
          let swapSuccess = false;
          result.balanceChanges.forEach(change => {
            const amount = parseInt(change.amount);
            if (change.coinType.includes('sui::SUI')) {
              console.log(`   SUI: ${(amount / 1e9).toFixed(6)}`);
            } else if (change.coinType.includes('usdc')) {
              console.log(`   USDC: ${(amount / 1e6).toFixed(6)}`);
              if (amount > 0) swapSuccess = true;
            }
          });
          if (swapSuccess) {
            console.log('\n🎉 SUCCESS! Real swap completed!');
          }
        }
        if (result.events && result.events.length > 0) {
          console.log('\n📊 Events:');
          result.events.forEach((event, index) => {
            console.log(`   [${index}] ${event.type}`);
            if (event.type.includes('SwapEvent') || event.type.includes('trade')) {
              console.log(`       🎯 SWAP EVENT DETECTED!`);
              if (event.parsedJson?.amount_y) {
                console.log(`       💎 Amount: ${event.parsedJson.amount_y}`);
              }
            }
          });
        }
      } else {
        console.error(`❌ Transaction failed: ${result.effects?.status?.error}`);
      }
      return result;
    } catch (error) {
      console.error('Error executing transaction:', error);
      throw error;
    }
  }

  async getUsdcBalance(address) {
    try {
      const usdcCoins = await this.client.getCoins({
        owner: address,
        coinType: this.USDC_TYPE,
      });
      if (!usdcCoins.data.length) {
        return "0";
      }
      const totalBalance = usdcCoins.data.reduce((sum, coin) => sum + BigInt(coin.balance), BigInt(0));
      return totalBalance.toString();
    } catch (error) {
      console.error(`Error checking USDC balance: ${error.message}`);
      return "0";
    }
  }

  calculateMinAmountOut(amountOut, customSlippage = null) {
    const slippage = customSlippage ||
      (this.priceMonitor ? this.priceMonitor.getDynamicSlippage() : 0.02);
    const validAmountOut = parseInt(amountOut) || 0;
    const minAmountOut = Math.floor(validAmountOut * (1 - slippage));
    console.log(`🎯 Slippage: ${(slippage * 100).toFixed(3)}% | Min out: ${minAmountOut}`);
    return minAmountOut;
  }

  async getPoolInfo() {
    try {
      const poolObject = await this.client.getObject({
        id: this.POOL_ID,
        options: {
          showContent: true,
          showType: true
        }
      });
      console.log('🏊 Pool Info:');
      console.log(`   Pool ID: ${this.POOL_ID}`);
      console.log(`   Type: ${poolObject.data?.type}`);
      return poolObject;
    } catch (error) {
      console.error('Error getting pool info:', error);
      return null;
    }
  }
}
