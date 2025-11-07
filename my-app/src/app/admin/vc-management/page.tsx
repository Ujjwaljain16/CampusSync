'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { 
  Key, 
  CheckCircle, 
  XCircle, 
  RefreshCw,
  AlertTriangle,
  Clock,
  BarChart3,
  FileText,
  Activity
} from 'lucide-react';

interface VCStats {
  totalIssuances: number;
  successfulIssuances: number;
  failedIssuances: number;
  byType: Record<string, number>;
  byUser: Record<string, number>;
}

interface RevocationStats {
  totalRevoked: number;
  byReason: Record<string, number>;
  byStatus: Record<string, number>;
  byIssuer: Record<string, number>;
}

interface VerificationStats {
  totalVerifications: number;
  successfulVerifications: number;
  failedVerifications: number;
  averageProcessingTime: number;
  byVerifier: Record<string, number>;
}

export default function VCManagementPage() {
  const [loading, setLoading] = useState(true);
  const [vcStats, setVcStats] = useState<VCStats | null>(null);
  const [revocationStats, setRevocationStats] = useState<RevocationStats | null>(null);
  const [verificationStats, setVerificationStats] = useState<VerificationStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'issuance' | 'verification' | 'revocation' | 'keys'>('overview');

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Fetch VC issuance stats
      const vcResponse = await fetch('/api/vc/issue/stats');
      if (vcResponse.ok) {
        const vcData = await vcResponse.json();
        setVcStats(vcData.data);
      }

      // Fetch verification stats
      const verificationResponse = await fetch('/api/vc/verify');
      if (verificationResponse.ok) {
        const verificationData = await verificationResponse.json();
        setVerificationStats(verificationData.data);
      }

      // Fetch revocation stats
      const revocationResponse = await fetch('/api/vc/revoke');
      if (revocationResponse.ok) {
        const revocationData = await revocationResponse.json();
        setRevocationStats(revocationData.data);
      }

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-400" />
          <span className="ml-2">Loading VC management data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-white">VC Management</h1>
              <p className="text-gray-300 mt-1">Manage Verifiable Credentials, keys, and policies</p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={fetchStats}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Refresh</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="border-b border-gray-700">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: 'overview', name: 'Overview', icon: BarChart3 },
              { id: 'issuance', name: 'Issuance', icon: FileText },
              { id: 'verification', name: 'Verification', icon: CheckCircle },
              { id: 'revocation', name: 'Revocation', icon: XCircle },
              { id: 'keys', name: 'Key Management', icon: Key }
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as 'overview' | 'issuance' | 'verification' | 'revocation' | 'keys')}
                  className={`flex items-center space-x-2 py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.name}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        {error && (
          <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 mb-6">
            <div className="flex items-center">
              <AlertTriangle className="w-5 h-5 text-red-400 mr-2" />
              <span className="text-red-300">{error}</span>
            </div>
          </div>
        )}

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-white mb-6">System Overview</h2>
            
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-gray-800 rounded-lg p-6">
                <div className="flex items-center">
                  <FileText className="w-8 h-8 text-blue-400" />
                  <div className="ml-4">
                    <p className="text-sm text-gray-400">Total Issuances</p>
                    <p className="text-2xl font-bold text-white">
                      {vcStats?.totalIssuances || 0}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-6">
                <div className="flex items-center">
                  <CheckCircle className="w-8 h-8 text-green-400" />
                  <div className="ml-4">
                    <p className="text-sm text-gray-400">Successful</p>
                    <p className="text-2xl font-bold text-white">
                      {vcStats?.successfulIssuances || 0}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-6">
                <div className="flex items-center">
                  <XCircle className="w-8 h-8 text-red-400" />
                  <div className="ml-4">
                    <p className="text-sm text-gray-400">Revoked</p>
                    <p className="text-2xl font-bold text-white">
                      {revocationStats?.totalRevoked || 0}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-6">
                <div className="flex items-center">
                  <Activity className="w-8 h-8 text-purple-400" />
                  <div className="ml-4">
                    <p className="text-sm text-gray-400">Verifications</p>
                    <p className="text-2xl font-bold text-white">
                      {verificationStats?.totalVerifications || 0}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Success Rate */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Success Rate</h3>
              <div className="flex items-center space-x-4">
                <div className="flex-1">
                  <div className="flex justify-between text-sm text-gray-400 mb-1">
                    <span>Issuance Success</span>
                    <span>
                      {vcStats?.totalIssuances 
                        ? Math.round((vcStats.successfulIssuances / vcStats.totalIssuances) * 100)
                        : 0}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-green-500 h-2 rounded-full" 
                      style={{ 
                        width: `${vcStats?.totalIssuances 
                          ? (vcStats.successfulIssuances / vcStats.totalIssuances) * 100
                          : 0}%` 
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Issuance Tab */}
        {activeTab === 'issuance' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-white mb-6">Issuance Management</h2>
            
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Issuance Statistics</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-gray-400 mb-2">By Credential Type</p>
                  <div className="space-y-2">
                    {vcStats?.byType && Object.entries(vcStats.byType).map(([type, count]) => (
                      <div key={type} className="flex justify-between">
                        <span className="text-white capitalize">{type}</span>
                        <span className="text-blue-400">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-400 mb-2">Top Users</p>
                  <div className="space-y-2">
                    {vcStats?.byUser && Object.entries(vcStats.byUser)
                      .sort(([,a], [,b]) => b - a)
                      .slice(0, 5)
                      .map(([userId, count]) => (
                        <div key={userId} className="flex justify-between">
                          <span className="text-white font-mono text-sm">{userId.slice(0, 8)}...</span>
                          <span className="text-blue-400">{count}</span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Verification Tab */}
        {activeTab === 'verification' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-white mb-6">Verification Management</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gray-800 rounded-lg p-6">
                <div className="flex items-center">
                  <CheckCircle className="w-8 h-8 text-green-400" />
                  <div className="ml-4">
                    <p className="text-sm text-gray-400">Successful</p>
                    <p className="text-2xl font-bold text-white">
                      {verificationStats?.successfulVerifications || 0}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-6">
                <div className="flex items-center">
                  <XCircle className="w-8 h-8 text-red-400" />
                  <div className="ml-4">
                    <p className="text-sm text-gray-400">Failed</p>
                    <p className="text-2xl font-bold text-white">
                      {verificationStats?.failedVerifications || 0}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-6">
                <div className="flex items-center">
                  <Clock className="w-8 h-8 text-blue-400" />
                  <div className="ml-4">
                    <p className="text-sm text-gray-400">Avg. Time</p>
                    <p className="text-2xl font-bold text-white">
                      {verificationStats?.averageProcessingTime 
                        ? `${Math.round(verificationStats.averageProcessingTime)}ms`
                        : '0ms'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Revocation Tab */}
        {activeTab === 'revocation' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-white mb-6">Revocation Management</h2>
            
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Revocation Statistics</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-gray-400 mb-2">By Reason</p>
                  <div className="space-y-2">
                    {revocationStats?.byReason && Object.entries(revocationStats.byReason).map(([reason, count]) => (
                      <div key={reason} className="flex justify-between">
                        <span className="text-white">{reason}</span>
                        <span className="text-red-400">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-400 mb-2">By Status</p>
                  <div className="space-y-2">
                    {revocationStats?.byStatus && Object.entries(revocationStats.byStatus).map(([status, count]) => (
                      <div key={status} className="flex justify-between">
                        <span className="text-white capitalize">{status}</span>
                        <span className="text-red-400">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Key Management Tab */}
        {activeTab === 'keys' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-white mb-6">Key Management</h2>
            
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Signing Keys</h3>
              <p className="text-gray-400 mb-4">
                Manage cryptographic keys used for signing Verifiable Credentials.
              </p>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-700 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Key className="w-5 h-5 text-blue-400" />
                    <div>
                      <p className="text-white font-medium">Current Signing Key</p>
                      <p className="text-sm text-gray-400">RSA-2048 • Active</p>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm">
                      Rotate
                    </button>
                    <button className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded text-sm">
                      Export
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
