import { generateKeyPair, exportJWK, importJWK, SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'crypto';

export interface ProductionJWK {
  kty: 'RSA' | 'EC';
  use: 'sig';
  kid: string;
  alg: 'RS256' | 'ES256';
  n?: string;
  e?: string;
  d?: string;
  p?: string;
  q?: string;
  dp?: string;
  dq?: string;
  qi?: string;
  crv?: 'P-256' | 'P-384' | 'P-521';
  x?: string;
  y?: string;
}

export interface KeyRotationConfig {
  rotationInterval: number; // days
  keyRetentionPeriod: number; // days
  maxActiveKeys: number;
}

export class ProductionKeyManager {
  private static instance: ProductionKeyManager;
  private keys: Map<string, ProductionJWK> = new Map();
  private currentKeyId: string | null = null;
  private keyRotationConfig: KeyRotationConfig;

  constructor(config: KeyRotationConfig = {
    rotationInterval: 90, // 90 days
    keyRetentionPeriod: 365, // 1 year
    maxActiveKeys: 3
  }) {
    this.keyRotationConfig = config;
  }

  static getInstance(): ProductionKeyManager {
    if (!ProductionKeyManager.instance) {
      ProductionKeyManager.instance = new ProductionKeyManager();
    }
    return ProductionKeyManager.instance;
  }

  /**
   * Generate a new production-ready key pair
   */
  async generateProductionKey(): Promise<ProductionJWK> {
    const keyId = `key-${randomUUID()}`;
    
    // Generate RSA key pair for production
    const { publicKey, privateKey } = await generateKeyPair('RS256', {
      modulusLength: 2048, // Production-grade key size
    });

    const jwk = await exportJWK(privateKey);
    
    const productionJWK: ProductionJWK = {
      kty: 'RSA',
      use: 'sig',
      kid: keyId,
      alg: 'RS256',
      n: jwk.n,
      e: jwk.e,
      d: jwk.d,
      p: jwk.p,
      q: jwk.q,
      dp: jwk.dp,
      dq: jwk.dq,
      qi: jwk.qi,
    };

    this.keys.set(keyId, productionJWK);
    this.currentKeyId = keyId;

    return productionJWK;
  }

  /**
   * Get the current active key
   */
  getCurrentKey(): ProductionJWK | null {
    if (!this.currentKeyId) return null;
    return this.keys.get(this.currentKeyId) || null;
  }

  /**
   * Get a specific key by ID
   */
  getKey(keyId: string): ProductionJWK | null {
    return this.keys.get(keyId) || null;
  }

  /**
   * Rotate to a new key
   */
  async rotateKey(): Promise<ProductionJWK> {
    const newKey = await this.generateProductionKey();
    
    // Keep only the configured number of active keys
    if (this.keys.size > this.keyRotationConfig.maxActiveKeys) {
      const oldestKeyId = Array.from(this.keys.keys())[0];
      this.keys.delete(oldestKeyId);
    }

    return newKey;
  }

  /**
   * Validate key integrity
   */
  async validateKey(keyId: string): Promise<boolean> {
    const key = this.keys.get(keyId);
    if (!key) return false;

    try {
      const jwk = await importJWK(key, key.alg);
      // Test signing with the key
      const testJWT = await new SignJWT({ test: 'validation' })
        .setProtectedHeader({ alg: key.alg, kid: keyId })
        .setIssuedAt()
        .setExpirationTime('1m')
        .sign(jwk);
      
      // Verify the signature
      await jwtVerify(testJWT, jwk);
      return true;
    } catch (error) {
      console.error('Key validation failed:', error);
      return false;
    }
  }

  /**
   * Export keys for backup
   */
  exportKeys(): { keys: ProductionJWK[], currentKeyId: string | null } {
    return {
      keys: Array.from(this.keys.values()),
      currentKeyId: this.currentKeyId
    };
  }

  /**
   * Import keys from backup
   */
  importKeys(backup: { keys: ProductionJWK[], currentKeyId: string | null }): void {
    this.keys.clear();
    backup.keys.forEach(key => {
      this.keys.set(key.kid, key);
    });
    this.currentKeyId = backup.currentKeyId;
  }

  /**
   * Get key metadata for monitoring
   */
  getKeyMetadata(): Array<{ keyId: string; createdAt: Date; isActive: boolean }> {
    return Array.from(this.keys.entries()).map(([keyId, key]) => ({
      keyId,
      createdAt: new Date(), // In production, store actual creation time
      isActive: keyId === this.currentKeyId
    }));
  }
}
