'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Clock, CheckCircle, XCircle, RotateCcw, Eye, Calendar, User, FileText, AlertCircle, RefreshCw } from 'lucide-react';

interface ApprovalHistory {
  id: string;
  action: string;
  certificateId: string;
  certificate: {
    id: string;
    title: string;
    institution: string;
    user_id: string;
    verification_status: string;
    created_at: string;
  };
  approverRole: string;
  details: any;
  createdAt: string;
  canRevert: boolean;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function FacultyHistoryPage() {
  const [loading, setLoading] = useState(true);
  const [approvals, setApprovals] = useState<ApprovalHistory[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [error, setError] = useState<string | null>(null);
  const [reverting, setReverting] = useState<string | null>(null);
  const [showRevertModal, setShowRevertModal] = useState<string | null>(null);
  const [revertReason, setRevertReason] = useState('');

  const fetchApprovalHistory = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/certificates/approval-history?page=${page}&limit=20`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch approval history');
      }
      
      setApprovals(data.data.approvals);
      setPagination(data.data.pagination);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApprovalHistory();
  }, [fetchApprovalHistory]);

  const handleRevert = useCallback(async (certificateId: string) => {
    if (!revertReason.trim()) {
      alert('Please provide a reason for reverting this approval');
      return;
    }

    setReverting(certificateId);
    try {
      const response = await fetch('/api/certificates/revert-approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          certificateId, 
          reason: revertReason 
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to revert approval');
      }

      // Refresh the history
      await fetchApprovalHistory(pagination.page);
      setShowRevertModal(null);
      setRevertReason('');
      alert('Approval reverted successfully');
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setReverting(null);
    }
  }, [revertReason, fetchApprovalHistory, pagination.page]);

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'manual_approve':
      case 'batch_approve':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'manual_reject':
      case 'batch_reject':
        return <XCircle className="w-4 h-4 text-red-400" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getActionText = (action: string) => {
    switch (action) {
      case 'manual_approve':
        return 'Manually Approved';
      case 'batch_approve':
        return 'Batch Approved';
      case 'manual_reject':
        return 'Manually Rejected';
      case 'batch_reject':
        return 'Batch Rejected';
      default:
        return action;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const handlePageChange = (newPage: number) => {
    fetchApprovalHistory(newPage);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-400" />
          <span className="ml-2">Loading approval history...</span>
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
              <h1 className="text-3xl font-bold text-white">Approval History</h1>
              <p className="text-gray-300 mt-1">Track and manage certificate approvals</p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => fetchApprovalHistory(pagination.page)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Refresh</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 mb-6">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-red-400 mr-2" />
              <span className="text-red-300">{error}</span>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center">
              <CheckCircle className="w-8 h-8 text-green-400" />
              <div className="ml-4">
                <p className="text-sm text-gray-400">Total Approvals</p>
                <p className="text-2xl font-bold text-white">
                  {approvals.filter(a => a.action.includes('approve')).length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center">
              <XCircle className="w-8 h-8 text-red-400" />
              <div className="ml-4">
                <p className="text-sm text-gray-400">Total Rejections</p>
                <p className="text-2xl font-bold text-white">
                  {approvals.filter(a => a.action.includes('reject')).length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center">
              <FileText className="w-8 h-8 text-blue-400" />
              <div className="ml-4">
                <p className="text-sm text-gray-400">Total Actions</p>
                <p className="text-2xl font-bold text-white">{pagination.total}</p>
              </div>
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center">
              <User className="w-8 h-8 text-purple-400" />
              <div className="ml-4">
                <p className="text-sm text-gray-400">Your Role</p>
                <p className="text-lg font-semibold text-white capitalize">Faculty</p>
              </div>
            </div>
          </div>
        </div>

        {/* Approval History Table */}
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-700">
            <h2 className="text-xl font-semibold text-white">Recent Approvals</h2>
          </div>
          
          {approvals.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="w-12 h-12 text-gray-500 mx-auto mb-4" />
              <p className="text-gray-400 text-lg">No approval history found</p>
              <p className="text-gray-500 text-sm">Approvals will appear here once you start reviewing certificates</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Action
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Certificate
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Institution
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {approvals.map((approval) => (
                    <tr key={approval.id} className="hover:bg-gray-700/50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {getActionIcon(approval.action)}
                          <span className="ml-2 text-sm text-white">
                            {getActionText(approval.action)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-white font-medium">
                          {approval.certificate.title}
                        </div>
                        <div className="text-sm text-gray-400">
                          ID: {approval.certificate.id.slice(0, 8)}...
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {approval.certificate.institution}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        <div className="flex items-center">
                          <Calendar className="w-4 h-4 mr-1" />
                          {formatDate(approval.createdAt)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {approval.canRevert && (
                          <button
                            onClick={() => setShowRevertModal(approval.certificateId)}
                            disabled={reverting === approval.certificateId}
                            className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 text-white px-3 py-1 rounded text-xs flex items-center space-x-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Revert</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex justify-center items-center space-x-2 mt-6">
            <button
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 text-white rounded"
            >
              Previous
            </button>
            <span className="text-gray-300">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page === pagination.totalPages}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 text-white rounded"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Revert Modal */}
      {showRevertModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">Revert Approval</h3>
            <p className="text-gray-300 mb-4">
              Are you sure you want to revert this approval? The certificate will be moved back to pending status.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Reason for reverting:
              </label>
              <textarea
                value={revertReason}
                onChange={(e) => setRevertReason(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter reason for reverting this approval..."
                rows={3}
              />
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowRevertModal(null);
                  setRevertReason('');
                }}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRevert(showRevertModal)}
                disabled={reverting === showRevertModal}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 text-white rounded flex items-center space-x-2"
              >
                {reverting === showRevertModal && <RefreshCw className="w-4 h-4 animate-spin" />}
                <span>Revert Approval</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
