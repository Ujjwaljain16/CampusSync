'use client';

import React, { useCallback, useState } from 'react';
import { Upload, FileText, Check, AlertCircle, Eye, Sparkles, Award } from 'lucide-react';

// OCR extraction result type matching the API
type OcrExtractionResult = {
  title?: string;
  institution?: string;
  date_issued?: string;
  description?: string;
  raw_text?: string;
  confidence?: number;
};

// Verification result type
type VerificationResult = {
  certificate_id: string;
  is_verified: boolean;
  confidence_score: number;
  verification_method: string;
  details: {
    qr_verification?: {
      verified: boolean;
      data?: string;
      issuer?: string;
    };
    logo_match?: {
      matched: boolean;
      score: number;
      issuer?: string;
    };
    template_match?: {
      matched: boolean;
      score: number;
      patterns_matched: string[];
    };
    ai_confidence?: {
      score: number;
      factors: string[];
    };
  };
  auto_approved: boolean;
  requires_manual_review: boolean;
  created_at: string;
};

export default function StudentUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ocr, setOcr] = useState<OcrExtractionResult | null>(null);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [enableSmartVerification, setEnableSmartVerification] = useState(true);
  const [verification, setVerification] = useState<VerificationResult | null>(null);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
    setOcr(null);
    setPublicUrl(null);
    setVerification(null);
    setError(null);
    setSuccess(null);
  }, []);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      setOcr(null);
      setPublicUrl(null);
      setVerification(null);
      setError(null);
      setSuccess(null);
    }
  }, []);

  const handleOcr = useCallback(async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setSuccess(null);
    
    try {
      // Create FormData for file upload
      const formData = new FormData();
      formData.append('file', file);
      formData.append('enableSmartVerification', enableSmartVerification.toString());
      
      // Call OCR API endpoint
      const response = await fetch('/api/certificates/ocr', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'OCR processing failed');
      }
      
      const result = await response.json();
      
      // Set the extracted data and public URL
      setPublicUrl(result.data.publicUrl);
      setOcr({
        title: result.data.ocr.title || 'Untitled Certificate',
        institution: result.data.ocr.institution || '',
        date_issued: result.data.ocr.date_issued || new Date().toISOString().split('T')[0],
        description: result.data.ocr.description || result.data.ocr.raw_text || ''
      });
      
      // Set verification result if available
      if (result.data.verification) {
        setVerification(result.data.verification);
      }
      
    } catch (err) {
      console.error('OCR Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to process certificate');
    } finally {
      setUploading(false);
    }
  }, [file, enableSmartVerification]);

  const handleSave = useCallback(async () => {
    if (!publicUrl || !ocr) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    
    try {
      // Call create API endpoint with extracted data
      const response = await fetch('/api/certificates/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          publicUrl,
          ocr: {
            title: ocr.title,
            institution: ocr.institution,
            date_issued: ocr.date_issued,
            description: ocr.description,
            raw_text: ocr.raw_text,
            confidence: ocr.confidence
          }
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save certificate');
      }
      
      const result = await response.json();
      
      if (result.data?.status === 'created') {
        setSuccess('Certificate saved successfully! Awaiting faculty approval.');
        // Reset form after successful save
        setFile(null);
        setOcr(null);
        setPublicUrl(null);
      } else {
        throw new Error('Unexpected response from server');
      }
      
    } catch (err) {
      console.error('Save Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to save certificate');
    } finally {
      setSaving(false);
    }
  }, [publicUrl, ocr]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-purple-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      <div className="relative z-10 py-12 px-6">
        <div className="max-w-4xl mx-auto">
          {/* Header Section */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-3 mb-4">
              <div className="p-3 bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-2xl backdrop-blur-sm border border-white/10">
                <Award className="w-8 h-8 text-purple-300" />
              </div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-white via-purple-200 to-blue-200 bg-clip-text text-transparent">
                Upload Certificate
              </h1>
            </div>
            <p className="text-white/70 text-lg max-w-2xl mx-auto leading-relaxed">
              Upload your certificates and let our AI extract the details automatically. 
              Your achievements deserve recognition.
            </p>
          </div>

          {/* Main Upload Card */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
            {/* Progress Indicator */}
            <div className="px-8 pt-8">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
                    file ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/60'
                  }`}>
                    <div className={`w-2 h-2 rounded-full ${file ? 'bg-emerald-400' : 'bg-white/40'}`}></div>
                    <span className="text-sm font-medium">Upload</span>
                  </div>
                  <div className={`w-8 h-0.5 rounded-full transition-all ${
                    ocr ? 'bg-emerald-400' : 'bg-white/20'
                  }`}></div>
                  <div className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
                    ocr ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/60'
                  }`}>
                    <div className={`w-2 h-2 rounded-full ${ocr ? 'bg-emerald-400' : 'bg-white/40'}`}></div>
                    <span className="text-sm font-medium">Extract</span>
                  </div>
                  <div className={`w-8 h-0.5 rounded-full transition-all ${
                    success ? 'bg-emerald-400' : 'bg-white/20'
                  }`}></div>
                  <div className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
                    success ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/60'
                  }`}>
                    <div className={`w-2 h-2 rounded-full ${success ? 'bg-emerald-400' : 'bg-white/40'}`}></div>
                    <span className="text-sm font-medium">Save</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-8 pb-8">
              {/* File Upload Zone */}
              <div 
                className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 ${
                  dragActive 
                    ? 'border-purple-400 bg-purple-500/10' 
                    : file 
                    ? 'border-emerald-400 bg-emerald-500/10' 
                    : 'border-white/30 hover:border-white/50 hover:bg-white/5'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input 
                  type="file" 
                  accept="image/*,application/pdf" 
                  onChange={onFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                
                <div className="space-y-4">
                  <div className={`mx-auto w-16 h-16 rounded-2xl flex items-center justify-center transition-all ${
                    file ? 'bg-emerald-500/20' : 'bg-white/10'
                  }`}>
                    {file ? (
                      <FileText className="w-8 h-8 text-emerald-300" />
                    ) : (
                      <Upload className={`w-8 h-8 transition-colors ${
                        dragActive ? 'text-purple-300' : 'text-white/60'
                      }`} />
                    )}
                  </div>
                  
                  {file ? (
                    <div>
                      <p className="text-emerald-300 text-lg font-semibold">{file.name}</p>
                      <p className="text-white/60 text-sm">
                        {(file.size / 1024 / 1024).toFixed(2)} MB • Ready to process
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-white text-lg font-semibold mb-2">
                        {dragActive ? 'Drop your certificate here!' : 'Drag & drop your certificate'}
                      </p>
                      <p className="text-white/60 text-sm">
                        or <span className="text-purple-300 font-medium">browse files</span>
                      </p>
                      <p className="text-white/40 text-xs mt-2">
                        Supports PDF, PNG, JPG, JPEG • Max 10MB
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Smart Verification Toggle */}
              <div className="mt-6 p-4 bg-white/5 rounded-2xl border border-white/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-purple-300" />
                    </div>
                    <div>
                      <p className="text-white font-medium">Smart Verification</p>
                      <p className="text-white/60 text-sm">Enable AI-powered certificate verification</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableSmartVerification}
                      onChange={(e) => setEnableSmartVerification(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-white/20 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
                  </label>
                </div>
              </div>

              {/* Verification Results */}
              {verification && (
                <div className="mt-6 p-6 bg-white/5 rounded-2xl border border-white/10">
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      verification.auto_approved 
                        ? 'bg-emerald-500/20' 
                        : verification.requires_manual_review 
                        ? 'bg-yellow-500/20' 
                        : 'bg-red-500/20'
                    }`}>
                      {verification.auto_approved ? (
                        <Check className="w-5 h-5 text-emerald-300" />
                      ) : verification.requires_manual_review ? (
                        <AlertCircle className="w-5 h-5 text-yellow-300" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-red-300" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-white font-semibold">
                        {verification.auto_approved 
                          ? 'Certificate Auto-Approved!' 
                          : verification.requires_manual_review 
                          ? 'Requires Manual Review' 
                          : 'Verification Failed'}
                      </h3>
                      <p className="text-white/60 text-sm">
                        Confidence: {(verification.confidence_score * 100).toFixed(1)}% • 
                        Method: {verification.verification_method.replace('_', ' ')}
                      </p>
                    </div>
                  </div>

                  {/* Verification Details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {verification.details.qr_verification && (
                      <div className="p-3 bg-white/5 rounded-xl">
                        <p className="text-white/80 text-sm font-medium mb-1">QR Verification</p>
                        <p className={`text-sm ${
                          verification.details.qr_verification.verified 
                            ? 'text-emerald-300' 
                            : 'text-red-300'
                        }`}>
                          {verification.details.qr_verification.verified 
                            ? `✓ Verified by ${verification.details.qr_verification.issuer}` 
                            : '✗ No valid QR code found'}
                        </p>
                      </div>
                    )}

                    {verification.details.logo_match && (
                      <div className="p-3 bg-white/5 rounded-xl">
                        <p className="text-white/80 text-sm font-medium mb-1">Logo Match</p>
                        <p className={`text-sm ${
                          verification.details.logo_match.matched 
                            ? 'text-emerald-300' 
                            : 'text-red-300'
                        }`}>
                          {verification.details.logo_match.matched 
                            ? `✓ Matched ${verification.details.logo_match.issuer} (${(verification.details.logo_match.score * 100).toFixed(1)}%)` 
                            : `✗ No logo match (${(verification.details.logo_match.score * 100).toFixed(1)}%)`}
                        </p>
                      </div>
                    )}

                    {verification.details.template_match && (
                      <div className="p-3 bg-white/5 rounded-xl">
                        <p className="text-white/80 text-sm font-medium mb-1">Template Match</p>
                        <p className={`text-sm ${
                          verification.details.template_match.matched 
                            ? 'text-emerald-300' 
                            : 'text-red-300'
                        }`}>
                          {verification.details.template_match.matched 
                            ? `✓ Pattern matched (${(verification.details.template_match.score * 100).toFixed(1)}%)` 
                            : `✗ No pattern match (${(verification.details.template_match.score * 100).toFixed(1)}%)`}
                        </p>
                      </div>
                    )}

                    {verification.details.ai_confidence && (
                      <div className="p-3 bg-white/5 rounded-xl">
                        <p className="text-white/80 text-sm font-medium mb-1">AI Confidence</p>
                        <p className="text-emerald-300 text-sm">
                          ✓ {(verification.details.ai_confidence.score * 100).toFixed(1)}% confidence
                        </p>
                        <p className="text-white/60 text-xs mt-1">
                          Factors: {verification.details.ai_confidence.factors.join(', ')}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-4 mt-8">
                <button 
                  className={`group flex-1 relative overflow-hidden bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-4 rounded-2xl font-semibold transition-all duration-300 hover:from-blue-600 hover:to-purple-700 hover:shadow-xl hover:shadow-purple-500/25 disabled:opacity-50 disabled:cursor-not-allowed ${
                    uploading ? 'animate-pulse' : 'hover:scale-105'
                  }`}
                  onClick={handleOcr} 
                  disabled={!file || uploading}
                >
                  <div className="flex items-center justify-center gap-3">
                    {uploading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        <span>{enableSmartVerification ? 'Processing & Verifying...' : 'Processing Magic...'}</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5" />
                        <span>{enableSmartVerification ? 'Extract & Verify' : 'Extract with AI'}</span>
                      </>
                    )}
                  </div>
                  {!uploading && (
                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                  )}
                </button>

                <button 
                  className={`group flex-1 relative overflow-hidden bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-8 py-4 rounded-2xl font-semibold transition-all duration-300 hover:from-emerald-600 hover:to-emerald-700 hover:shadow-xl hover:shadow-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed ${
                    saving ? 'animate-pulse' : 'hover:scale-105'
                  }`}
                  onClick={handleSave} 
                  disabled={!publicUrl || saving}
                >
                  <div className="flex items-center justify-center gap-3">
                    {saving ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-5 h-5" />
                        <span>Save Certificate</span>
                      </>
                    )}
                  </div>
                  {!saving && (
                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                  )}
                </button>
              </div>

              {/* Status Messages */}
              {(error || success) && (
                <div className={`mt-6 p-4 rounded-2xl border backdrop-blur-sm ${
                  error 
                    ? 'bg-red-500/10 border-red-500/20 text-red-300' 
                    : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                }`}>
                  <div className="flex items-center gap-3">
                    {error ? (
                      <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    ) : (
                      <Check className="w-5 h-5 flex-shrink-0" />
                    )}
                    <p className="font-medium">{error || success}</p>
                  </div>
                </div>
              )}

              {/* File Preview */}
              {publicUrl && (
                <div className="mt-6 p-4 bg-white/5 rounded-2xl border border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                      <Eye className="w-5 h-5 text-blue-300" />
                    </div>
                    <div className="flex-1">
                      <p className="text-white/80 text-sm font-medium">Uploaded file ready</p>
                      <a 
                        href={publicUrl} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-blue-300 hover:text-blue-200 text-sm underline underline-offset-2 transition-colors"
                      >
                        View original file
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* OCR Results */}
              {ocr && (
                <div className="mt-8 space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-xl flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-purple-300" />
                    </div>
                    <h2 className="text-white text-xl font-bold">Extracted Information</h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-white/70">Certificate Title</label>
                      <input 
                        className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400/50 focus:border-transparent transition-all hover:bg-white/10" 
                        value={ocr.title ?? ''} 
                        onChange={e => setOcr({ ...ocr, title: e.target.value })}
                        placeholder="Enter certificate title..."
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-white/70">Institution</label>
                      <input 
                        className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400/50 focus:border-transparent transition-all hover:bg-white/10" 
                        value={ocr.institution ?? ''} 
                        onChange={e => setOcr({ ...ocr, institution: e.target.value })}
                        placeholder="Enter institution name..."
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-white/70">Date Issued</label>
                      <input 
                        type="date" 
                        className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400/50 focus:border-transparent transition-all hover:bg-white/10" 
                        value={ocr.date_issued ?? ''} 
                        onChange={e => setOcr({ ...ocr, date_issued: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2 md:col-span-1">
                      <label className="block text-sm font-medium text-white/70">Description</label>
                      <textarea 
                        className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400/50 focus:border-transparent transition-all hover:bg-white/10 resize-none" 
                        rows={4} 
                        value={ocr.description ?? ''} 
                        onChange={e => setOcr({ ...ocr, description: e.target.value })}
                        placeholder="Enter certificate description..."
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="text-center mt-12">
            <p className="text-white/50 text-sm">
              Your certificates are securely processed and stored. 
              <span className="text-purple-300"> Privacy guaranteed.</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}