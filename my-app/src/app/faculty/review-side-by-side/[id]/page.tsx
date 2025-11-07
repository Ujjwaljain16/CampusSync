"use client";
import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";

type Document = {
  id: string;
  title: string;
  institution: string;
  document_type: string;
  file_url: string;
  verification_status: string;
  created_at: string;
  metadata?: Record<string, unknown>;
};

type Evidence = {
  qr?: { data?: string; verified?: boolean } | null;
  mrz?: { found?: boolean; valid?: boolean; lines?: string[] } | null;
  logo?: { score?: number; method?: string } | null;
  policy?: { score?: number; outcome?: string } | null;
  extracted?: Record<string, unknown> | null;
};

export default function SideBySideReviewPage() {
  const params = useParams();
  const router = useRouter();
  const documentId = (params?.id as string) || "";
  
  const [document, setDocument] = useState<Document | null>(null);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<'preview' | 'fields' | 'evidence'>('preview');

  useEffect(() => {
    if (documentId) {
      loadDocument();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]); // loadDocument is stable and only depends on documentId which is in deps

  const loadDocument = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load document details
      const docRes = await fetch(`/api/documents/${documentId}`, { cache: "no-store" });
      if (!docRes.ok) throw new Error(`Failed to load document: ${docRes.status}`);
      const docData = await docRes.json();
      setDocument(docData);

      // Load evidence
      const evRes = await fetch(`/api/documents/evidence?documentId=${documentId}`, { cache: "no-store" });
      if (evRes.ok) {
        const evData = await evRes.json();
        setEvidence(evData);
      }

    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load document");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    try {
      const res = await fetch('/api/documents/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          documentId, 
          verificationStatus: 'verified',
          reason: 'Faculty approved via side-by-side review'
        })
      });
      
      if (res.ok) {
        router.push('/faculty/dashboard');
      }
    } catch (error) {
      console.error('Approval failed:', error);
    }
  };

  const handleReject = async () => {
    try {
      const res = await fetch('/api/documents/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          documentId, 
          reason: 'Faculty rejected via side-by-side review'
        })
      });
      
      if (res.ok) {
        router.push('/faculty/dashboard');
      }
    } catch (error) {
      console.error('Rejection failed:', error);
    }
  };

  const handleSendBack = async () => {
    try {
      const res = await fetch('/api/documents/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          documentId, 
          verificationStatus: 'pending',
          reason: 'Sent back to student for resubmission'
        })
      });
      
      if (res.ok) {
        router.push('/faculty/dashboard');
      }
    } catch (error) {
      console.error('Send back failed:', error);
    }
  };

  if (loading) return <div className="p-6">Loading...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!document) return <div className="p-6">Document not found</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Document Review</h1>
            <p className="text-gray-600">{document.title} - {document.institution}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/faculty/dashboard')}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-80px)]">
        {/* Left Panel - Document Preview */}
        <div className="w-1/2 border-r bg-white">
          <div className="h-full flex flex-col">
            <div className="p-4 border-b">
              <h2 className="text-lg font-medium">Document Preview</h2>
            </div>
            <div className="flex-1 p-4 overflow-auto">
              {document.file_url ? (
                <div className="w-full h-full">
                  {document.file_url.endsWith('.pdf') ? (
                    <iframe
                      src={document.file_url}
                      className="w-full h-full border rounded"
                      title="Document Preview"
                    />
                  ) : (
                    <Image
                      src={document.file_url}
                      alt="Document Preview"
                      width={800}
                      height={1000}
                      className="w-full h-auto max-h-full object-contain"
                    />
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  No document preview available
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Analysis */}
        <div className="w-1/2 bg-white">
          <div className="h-full flex flex-col">
            {/* Tabs */}
            <div className="border-b">
              <div className="flex">
                {[
                  { id: 'preview', label: 'Preview' },
                  { id: 'fields', label: 'Extracted Fields' },
                  { id: 'evidence', label: 'Evidence' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setSelectedTab(tab.id as 'preview' | 'fields' | 'evidence')}
                    className={`px-4 py-3 text-sm font-medium ${
                      selectedTab === tab.id
                        ? 'border-b-2 border-blue-500 text-blue-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-auto p-4">
              {selectedTab === 'preview' && (
                <div className="space-y-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="font-medium mb-2">Document Information</h3>
                    <div className="space-y-2 text-sm">
                      <div><span className="font-medium">Title:</span> {document.title}</div>
                      <div><span className="font-medium">Institution:</span> {document.institution}</div>
                      <div><span className="font-medium">Type:</span> {document.document_type}</div>
                      <div><span className="font-medium">Status:</span> 
                        <span className={`ml-2 px-2 py-1 rounded text-xs ${
                          document.verification_status === 'verified' ? 'bg-green-100 text-green-800' :
                          document.verification_status === 'rejected' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {document.verification_status}
                        </span>
                      </div>
                      <div><span className="font-medium">Created:</span> {new Date(document.created_at).toLocaleString()}</div>
                    </div>
                  </div>

                  {document.metadata && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h3 className="font-medium mb-2">Metadata</h3>
                      <pre className="text-xs bg-white p-2 rounded overflow-auto">
                        {JSON.stringify(document.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {selectedTab === 'fields' && (
                <div className="space-y-4">
                  <h3 className="font-medium">Extracted Fields</h3>
                  {evidence?.extracted ? (
                    <div className="space-y-3">
                      {Object.entries(evidence.extracted).map(([key, value]) => (
                        <div key={key} className="bg-gray-50 p-3 rounded">
                          <div className="font-medium text-sm text-gray-600">{key}</div>
                          <div className="text-sm">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-gray-500 text-center py-8">No extracted fields available</div>
                  )}
                </div>
              )}

              {selectedTab === 'evidence' && (
                <div className="space-y-4">
                  <h3 className="font-medium">Verification Evidence</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 p-4 rounded">
                      <h4 className="font-medium text-sm mb-2">QR Code</h4>
                      <div className="text-sm">
                        <div>Verified: {evidence?.qr?.verified ? 'Yes' : 'No'}</div>
                        <div>Data: {evidence?.qr?.data || 'None'}</div>
                      </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded">
                      <h4 className="font-medium text-sm mb-2">MRZ</h4>
                      <div className="text-sm">
                        <div>Found: {evidence?.mrz?.found ? 'Yes' : 'No'}</div>
                        <div>Valid: {evidence?.mrz?.valid ? 'Yes' : 'No'}</div>
                      </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded">
                      <h4 className="font-medium text-sm mb-2">Logo Match</h4>
                      <div className="text-sm">
                        <div>Score: {evidence?.logo?.score ?? 'N/A'}</div>
                        <div>Method: {evidence?.logo?.method || 'N/A'}</div>
                      </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded">
                      <h4 className="font-medium text-sm mb-2">Policy</h4>
                      <div className="text-sm">
                        <div>Score: {evidence?.policy?.score ?? 'N/A'}</div>
                        <div>Outcome: {evidence?.policy?.outcome || 'N/A'}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="border-t p-4">
              <div className="flex gap-3">
                <button
                  onClick={handleApprove}
                  className="flex-1 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                >
                  Approve
                </button>
                <button
                  onClick={handleSendBack}
                  className="flex-1 bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700"
                >
                  ↶ Send Back
                </button>
                <button
                  onClick={handleReject}
                  className="flex-1 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
