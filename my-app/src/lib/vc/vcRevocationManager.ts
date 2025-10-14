import { randomUUID } from 'crypto';

export interface RevocationReason {
  code: string;
  description: string;
  category: 'suspension' | 'expiration' | 'error' | 'fraud' | 'user_request' | 'policy_violation';
}

export interface RevocationRecord {
  id: string;
  credentialId: string;
  revokedAt: Date;
  revokedBy: string;
  reason: RevocationReason;
  status: 'revoked' | 'suspended' | 'expired';
  metadata: Record<string, any>;
}

export interface RevocationList {
  id: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  revokedCredentials: RevocationRecord[];
  issuer: string;
}

export interface RevocationCheckResult {
  isRevoked: boolean;
  revocationRecord?: RevocationRecord;
  status: 'active' | 'revoked' | 'suspended' | 'expired';
  lastChecked: Date;
}

export class VCRevocationManager {
  private static instance: VCRevocationManager;
  private revocationLists: Map<string, RevocationList> = new Map();
  private revocationReasons: Map<string, RevocationReason> = new Map();

  constructor() {
    this.initializeDefaultReasons();
  }

  static getInstance(): VCRevocationManager {
    if (!VCRevocationManager.instance) {
      VCRevocationManager.instance = new VCRevocationManager();
    }
    return VCRevocationManager.instance;
  }

  /**
   * Initialize default revocation reasons
   */
  private initializeDefaultReasons(): void {
    const defaultReasons: RevocationReason[] = [
      {
        code: 'FRAUD',
        description: 'Credential obtained through fraudulent means',
        category: 'fraud'
      },
      {
        code: 'ERROR',
        description: 'Credential issued in error',
        category: 'error'
      },
      {
        code: 'SUSPENSION',
        description: 'Credential temporarily suspended',
        category: 'suspension'
      },
      {
        code: 'EXPIRATION',
        description: 'Credential has expired',
        category: 'expiration'
      },
      {
        code: 'USER_REQUEST',
        description: 'Revoked at user request',
        category: 'user_request'
      },
      {
        code: 'POLICY_VIOLATION',
        description: 'Violation of issuance policy',
        category: 'policy_violation'
      }
    ];

    defaultReasons.forEach(reason => {
      this.revocationReasons.set(reason.code, reason);
    });
  }

  /**
   * Revoke a credential
   */
  async revokeCredential(
    credentialId: string,
    revokedBy: string,
    reasonCode: string,
    metadata: Record<string, any> = {}
  ): Promise<RevocationRecord> {
    const reason = this.revocationReasons.get(reasonCode);
    if (!reason) {
      throw new Error(`Invalid revocation reason code: ${reasonCode}`);
    }

    const revocationRecord: RevocationRecord = {
      id: randomUUID(),
      credentialId,
      revokedAt: new Date(),
      revokedBy,
      reason,
      status: 'revoked',
      metadata
    };

    // Add to appropriate revocation list
    const issuer = metadata.issuer || 'default';
    await this.addToRevocationList(issuer, revocationRecord);

    return revocationRecord;
  }

  /**
   * Suspend a credential
   */
  async suspendCredential(
    credentialId: string,
    suspendedBy: string,
    reasonCode: string,
    metadata: Record<string, any> = {}
  ): Promise<RevocationRecord> {
    const reason = this.revocationReasons.get(reasonCode);
    if (!reason) {
      throw new Error(`Invalid revocation reason code: ${reasonCode}`);
    }

    const revocationRecord: RevocationRecord = {
      id: randomUUID(),
      credentialId,
      revokedAt: new Date(),
      revokedBy: suspendedBy,
      reason,
      status: 'suspended',
      metadata
    };

    const issuer = metadata.issuer || 'default';
    await this.addToRevocationList(issuer, revocationRecord);

    return revocationRecord;
  }

  /**
   * Check if a credential is revoked
   */
  async checkRevocationStatus(credentialId: string, issuer?: string): Promise<RevocationCheckResult> {
    const issuerKey = issuer || 'default';
    const revocationList = this.revocationLists.get(issuerKey);

    if (!revocationList) {
      return {
        isRevoked: false,
        status: 'active',
        lastChecked: new Date()
      };
    }

    const revocationRecord = revocationList.revokedCredentials.find(
      record => record.credentialId === credentialId
    );

    if (!revocationRecord) {
      return {
        isRevoked: false,
        status: 'active',
        lastChecked: new Date()
      };
    }

    return {
      isRevoked: true,
      revocationRecord,
      status: revocationRecord.status,
      lastChecked: new Date()
    };
  }

  /**
   * Restore a revoked credential
   */
  async restoreCredential(
    credentialId: string,
    restoredBy: string,
    issuer?: string
  ): Promise<boolean> {
    const issuerKey = issuer || 'default';
    const revocationList = this.revocationLists.get(issuerKey);

    if (!revocationList) {
      return false;
    }

    const recordIndex = revocationList.revokedCredentials.findIndex(
      record => record.credentialId === credentialId
    );

    if (recordIndex === -1) {
      return false;
    }

    // Remove from revocation list
    revocationList.revokedCredentials.splice(recordIndex, 1);
    revocationList.updatedAt = new Date();
    revocationList.version += 1;

    return true;
  }

  /**
   * Add revocation record to list
   */
  private async addToRevocationList(issuer: string, record: RevocationRecord): Promise<void> {
    let revocationList = this.revocationLists.get(issuer);

    if (!revocationList) {
      revocationList = {
        id: randomUUID(),
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        revokedCredentials: [],
        issuer
      };
      this.revocationLists.set(issuer, revocationList);
    }

    // Check if credential is already revoked
    const existingIndex = revocationList.revokedCredentials.findIndex(
      r => r.credentialId === record.credentialId
    );

    if (existingIndex !== -1) {
      // Update existing record
      revocationList.revokedCredentials[existingIndex] = record;
    } else {
      // Add new record
      revocationList.revokedCredentials.push(record);
    }

    revocationList.updatedAt = new Date();
    revocationList.version += 1;
  }

  /**
   * Get revocation list for an issuer
   */
  getRevocationList(issuer: string): RevocationList | undefined {
    return this.revocationLists.get(issuer);
  }

  /**
   * Get all revocation lists
   */
  getAllRevocationLists(): RevocationList[] {
    return Array.from(this.revocationLists.values());
  }

  /**
   * Get revocation statistics
   */
  getRevocationStats(): {
    totalRevoked: number;
    byReason: Record<string, number>;
    byStatus: Record<string, number>;
    byIssuer: Record<string, number>;
  } {
    const allRecords = Array.from(this.revocationLists.values())
      .flatMap(list => list.revokedCredentials);

    return {
      totalRevoked: allRecords.length,
      byReason: allRecords.reduce((acc, record) => {
        const reason = record.reason.code;
        acc[reason] = (acc[reason] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      byStatus: allRecords.reduce((acc, record) => {
        const status = record.status;
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      byIssuer: Array.from(this.revocationLists.entries()).reduce((acc, [issuer, list]) => {
        acc[issuer] = list.revokedCredentials.length;
        return acc;
      }, {} as Record<string, number>)
    };
  }

  /**
   * Add custom revocation reason
   */
  addRevocationReason(reason: RevocationReason): void {
    this.revocationReasons.set(reason.code, reason);
  }

  /**
   * Get all revocation reasons
   */
  getRevocationReasons(): RevocationReason[] {
    return Array.from(this.revocationReasons.values());
  }

  /**
   * Export revocation list as JSON-LD
   */
  exportRevocationList(issuer: string): any {
    const revocationList = this.revocationLists.get(issuer);
    if (!revocationList) {
      return null;
    }

    return {
      '@context': 'https://w3id.org/vc-revocation-list-2020/v1',
      id: `https://${issuer}/revocation-lists/${revocationList.id}`,
      type: 'RevocationList2020Status',
      issuer: revocationList.issuer,
      issued: revocationList.createdAt.toISOString(),
      revokedCredentials: revocationList.revokedCredentials.map(record => ({
        id: record.credentialId,
        revokedAt: record.revokedAt.toISOString(),
        reason: record.reason.code,
        status: record.status
      }))
    };
  }

  /**
   * Clean up expired revocations
   */
  async cleanupExpiredRevocations(issuer: string, maxAge: number = 365 * 24 * 60 * 60 * 1000): Promise<number> {
    const revocationList = this.revocationLists.get(issuer);
    if (!revocationList) {
      return 0;
    }

    const cutoffDate = new Date(Date.now() - maxAge);
    const initialCount = revocationList.revokedCredentials.length;

    revocationList.revokedCredentials = revocationList.revokedCredentials.filter(
      record => record.revokedAt > cutoffDate
    );

    const removedCount = initialCount - revocationList.revokedCredentials.length;
    
    if (removedCount > 0) {
      revocationList.updatedAt = new Date();
      revocationList.version += 1;
    }

    return removedCount;
  }
}
