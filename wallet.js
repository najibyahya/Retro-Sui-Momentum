import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiClient } from '@mysten/sui/client';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

export class WalletManager {
  constructor(privateKey, rpcUrl) {
    this.setupWallet(privateKey);
    this.client = new SuiClient({ url: rpcUrl });
  }

  setupWallet(privateKey) {
    try {
      let keypair;
      
      if (privateKey.startsWith('suiprivkey1')) {
        console.log('🔑 Detected Sui bech32 private key format');
        const { schema, secretKey } = decodeSuiPrivateKey(privateKey);
        
        if (schema === 'ED25519') {
          keypair = Ed25519Keypair.fromSecretKey(secretKey);
        } else {
          throw new Error(`Unsupported key schema: ${schema}`);
        }
      } else if (privateKey.startsWith('0x')) {
        console.log('🔑 Detected hex private key format');
        const cleanKey = privateKey.slice(2);
        if (cleanKey.length !== 64) {
          throw new Error(`Invalid hex key length. Expected 64 characters, got ${cleanKey.length}`);
        }
        const keyBytes = new Uint8Array(Buffer.from(cleanKey, 'hex'));
        keypair = Ed25519Keypair.fromSecretKey(keyBytes);
      } else if (privateKey.includes(' ')) {
        console.log('🔑 Detected mnemonic phrase format');
        keypair = Ed25519Keypair.deriveKeypair(privateKey);
      } else {
        console.log('🔑 Attempting base64 private key format');
        try {
          const keyBytes = Buffer.from(privateKey, 'base64');
          if (keyBytes.length === 32) {
            keypair = Ed25519Keypair.fromSecretKey(keyBytes);
          } else {
            throw new Error(`Invalid base64 key length. Expected 32 bytes, got ${keyBytes.length}`);
          }
        } catch (error) {
          throw new Error(`Invalid private key format: ${error.message}`);
        }
      }

      this.keypair = keypair;
      this.address = keypair.getPublicKey().toSuiAddress();
      
      console.log(`✅ Wallet loaded successfully`);
      console.log(`📍 Address: ${this.address}`);
      
    } catch (error) {
      console.error('❌ Error loading wallet:', error.message);
      throw error;
    }
  }

  async getBalance(coinType = '0x2::sui::SUI') {
    try {
      const balance = await this.client.getBalance({
        owner: this.address,
        coinType
      });
      return parseInt(balance.totalBalance);
    } catch (error) {
      console.error('Error getting balance:', error);
      return 0;
    }
  }

  async getAllCoins() {
    try {
      const coins = await this.client.getAllCoins({
        owner: this.address
      });
      return coins.data;
    } catch (error) {
      console.error('Error getting coins:', error);
      return [];
    }
  }

  async getCoins(coinType) {
    try {
      const coins = await this.client.getCoins({
        owner: this.address,
        coinType
      });
      return coins.data;
    } catch (error) {
      console.error('Error getting specific coins:', error);
      return [];
    }
  }

  async getCoinBalance(coinType) {
    try {
      const coins = await this.getCoins(coinType);
      return coins.reduce((total, coin) => total + parseInt(coin.balance), 0);
    } catch (error) {
      console.error('Error getting coin balance:', error);
      return 0;
    }
  }

  async getGasBudget() {
    const suiBalance = await this.getBalance();
    return Math.min(suiBalance * 0.01, 100000000); 
  }

  getPublicKey() {
    return this.keypair.getPublicKey();
  }

  getSigner() {
    return this.keypair;
  }
}
