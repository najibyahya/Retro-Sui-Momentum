import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { WalletManager } from './wallet.js';
import { MomentumSwap } from './momentum.js';
import { PriceMonitor } from './priceMonitor.js';
import { CONFIG, loadPrivateKey, validateConfig } from './config.js';

class RealMomentumBot {
    constructor() {
        this.isRunning = false;
        this.swapCount = 0;
        this.priceMonitor = new PriceMonitor();
        this.startTime = Date.now();
        this.totalVolume = 0;
        this.successfulSwaps = 0;
        this.failedSwaps = 0;
        this.targetSwapCount = 0; 
        this.currentSwapCycle = 0; 
    }

    async askSwapCount() {
        const rl = createInterface({
            input: stdin,
            output: stdout
        });

        return new Promise((resolve) => {
            rl.question('\n\x1b[34mBerapa kali swap & swapback :\x1b[32m ', (answer) => {
                const count = parseInt(answer);
                if (isNaN(count) || count <= 0) {
                    console.log('\x1b[31m❌ Input tidak valid.\x1b[0m Menggunakan default 1 kali.');
                    resolve(1);
                } else {
                    console.log(`\x1b[0m\n✅ Bot akan melakukan ${count} kali swap & swapback`);
                    resolve(count);
                }
                rl.close();
            });
        });
    }

    async initialize() {
        try {
            console.log('🚀 Initializing REAL Momentum Swap Bot...');
            validateConfig();
            
            this.targetSwapCount = await this.askSwapCount();
            
            const privateKey = loadPrivateKey();
            this.wallet = new WalletManager(privateKey, CONFIG.RPC_URL);
            this.momentum = new MomentumSwap(this.wallet.client, this.wallet.keypair, this.priceMonitor);
            
            await this.priceMonitor.startMonitoring();
            this.priceMonitor.onPriceChange((priceChange, prices) => {
                this.handlePriceChange(priceChange, prices);
            });
            
            console.log('✅ REAL swap bot initialized successfully');
            await this.displayWalletInfo();
        } catch (error) {
            console.error('❌ Initialization failed:', error.message);
            process.exit(1);
        }
    }

    handlePriceChange(priceChange, prices) {
        const sentiment = this.priceMonitor.getMarketSentiment();
        const changePercent = (priceChange * 100).toFixed(2);
        console.log(`\n🚨 REAL Price Movement: ${changePercent}% | $${prices.SUI_USD.toFixed(4)}`);
        
        if (Math.abs(priceChange) > CONFIG.PRICE_CHANGE_THRESHOLD && !this.isRunning && this.currentSwapCycle < this.targetSwapCount) {
            setTimeout(() => this.executeRealSwap(), 1000);
        }
    }

    async executeRealSwap() {
        if (this.isRunning || this.currentSwapCycle >= this.targetSwapCount) {
            if (this.currentSwapCycle >= this.targetSwapCount) {
                console.log(`\n🎯 Target tercapai! Telah melakukan ${this.targetSwapCount} kali swap & swapback`);
                await this.displayFinalStats();
                process.exit(0);
            }
            return;
        }

        this.isRunning = true;
        this.currentSwapCycle++;
        
        try {
            console.log(`\n🔄 Memulai siklus swap ke-${this.currentSwapCycle} dari ${this.targetSwapCount}`);
            
            const suiBalance = await this.wallet.getBalance(CONFIG.SUI_TYPE);
            const usdcBalance = await this.wallet.getBalance(CONFIG.USDC_TYPE);
            console.log(`💰 Before Swap: SUI: ${(suiBalance / 1e9).toFixed(4)}, USDC: ${(usdcBalance / 1e6).toFixed(6)}`);

            // swap SUI ke USDC [80% dari balance]
            const amountSuiToUsdc = Math.floor(suiBalance * 0.8);
            if (amountSuiToUsdc < 10000) {
                console.log('⚠️ SUI balance too low for 80% swap.');
                this.isRunning = false;
                return;
            }

            const quoteSuiToUsdc = await this.momentum.getQuote(CONFIG.SUI_TYPE, CONFIG.USDC_TYPE, amountSuiToUsdc);
            if (!quoteSuiToUsdc) {
                console.log('❌ Failed to get quote for SUI→USDC');
                this.isRunning = false;
                return;
            }

            const minAmountOutSuiToUsdc = this.momentum.calculateMinAmountOut(quoteSuiToUsdc.amountOut);
            console.log(`\n🚀 Swapping 80% SUI→USDC: ${(amountSuiToUsdc / 1e9).toFixed(4)} SUI`);
            await this.momentum.executeSwap(CONFIG.SUI_TYPE, CONFIG.USDC_TYPE, amountSuiToUsdc, minAmountOutSuiToUsdc);

            await new Promise(resolve => setTimeout(resolve, 5000));

            const usdcBalanceAfter = await this.wallet.getBalance(CONFIG.USDC_TYPE);
            if (usdcBalanceAfter < 10000) {
                console.log('⚠️ USDC balance too low for swap back.');
                this.isRunning = false;
                return;
            }

            const quoteUsdcToSui = await this.momentum.getQuote(CONFIG.USDC_TYPE, CONFIG.SUI_TYPE, usdcBalanceAfter);
            if (!quoteUsdcToSui) {
                console.log('❌ Failed to get quote for USDC→SUI');
                this.isRunning = false;
                return;
            }

            const minAmountOutUsdcToSui = this.momentum.calculateMinAmountOut(quoteUsdcToSui.amountOut);
            console.log(`\n🚀 Swapping ALL USDC→SUI: ${(usdcBalanceAfter / 1e6).toFixed(6)} USDC`);
            await this.momentum.executeSwap(CONFIG.USDC_TYPE, CONFIG.SUI_TYPE, usdcBalanceAfter, minAmountOutUsdcToSui);

            await new Promise(resolve => setTimeout(resolve, 5000));
            await this.displayWalletInfo();
            
            console.log(`✅ Siklus swap ke-${this.currentSwapCycle} selesai. Sisa: ${this.targetSwapCount - this.currentSwapCycle} siklus`);
            
            if (this.currentSwapCycle >= this.targetSwapCount) {
                console.log(`\n🎯 Target tercapai! Telah melakukan ${this.targetSwapCount} kali swap & swapback`);
                await this.displayFinalStats();
                process.exit(0);
            }

        } catch (error) {
            console.error('❌ REAL swap error:', error.message);
            this.failedSwaps++;
        } finally {
            this.isRunning = false;
        }
    }

    async displayFinalStats() {
        const endTime = Date.now();
        const duration = (endTime - this.startTime) / 1000;
        
        console.log('\n📊 FINAL STATISTICS:');
        console.log(`⏱️ Total Duration: ${duration.toFixed(2)} seconds`);
        console.log(`🔄 Total Swap Cycles: ${this.currentSwapCycle}`);
        console.log(`✅ Successful Swaps: ${this.successfulSwaps}`);
        console.log(`❌ Failed Swaps: ${this.failedSwaps}`);
        await this.displayWalletInfo();
    }

    async displayWalletInfo() {
        const suiBalance = await this.wallet.getBalance(CONFIG.SUI_TYPE);
        const usdcBalance = await this.wallet.getBalance(CONFIG.USDC_TYPE);
        const currentPrice = this.priceMonitor.prices.SUI_USD;
        const suiValue = (suiBalance / 1e9) * currentPrice;
        const usdcValue = usdcBalance / 1e6;
        const totalValue = suiValue + usdcValue;

        console.log('\n📊 REAL Portfolio Status:');
        console.log(`Address: ${this.wallet.address}`);
        console.log(`SUI: ${(suiBalance / 1e9).toFixed(4)} ($${suiValue.toFixed(2)})`);
        console.log(`USDC: ${(usdcBalance / 1e6).toFixed(6)} ($${usdcValue.toFixed(2)})`);
        console.log(`Total Value: $${totalValue.toFixed(2)}`);
    }

    async start() {
        await this.initialize();
        console.log(`\n🤖 REAL Momentum Swap Bot Started!`);
        
        await this.executeRealSwap();
        
        const realInterval = setInterval(async () => {
            if (this.currentSwapCycle < this.targetSwapCount) {
                console.log('\n⏰ Regular REAL swap trigger...');
                await this.executeRealSwap();
            } else {
                clearInterval(realInterval);
            }
        }, CONFIG.SWAP_INTERVAL || 60000);

        process.on('SIGINT', () => {
            console.log('\n🛑 Stopping REAL swap bot...');
            this.priceMonitor.stopMonitoring();
            clearInterval(realInterval);
            process.exit(0);
        });
    }
}

const realBot = new RealMomentumBot();
realBot.start().catch(error => {
    console.error('❌ REAL swap bot error:', error);
    process.exit(1);
});
