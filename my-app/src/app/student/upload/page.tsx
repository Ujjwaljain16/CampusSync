
"use client";

import { useState, useCallback, useMemo, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Upload, Eye, Sparkles, Check, AlertCircle, ArrowLeft, ScrollText, Zap, Shield, Brain } from 'lucide-react';
import { logger } from '@/lib/logger';

// OCR extraction result type matching the API
type OcrExtractionResult = {
  title?: string;
  institution?: string;
  date_issued?: string;
  description?: string;
  raw_text?: string;
  confidence?: number;
  recipient?: string;
  certificate_id?: string;
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

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
    setOcr(null);
    setPublicUrl(null);
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
      logger.debug('Starting certificate extraction with Gemini AI');
      const startTime = Date.now();
      
      // Use the Gemini Vision API for extraction
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/certificates/ocr-gemini', {
        method: 'POST',
        body: formData
      });
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.debug('Certificate extraction completed', { elapsedSeconds: elapsed });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to extract certificate information');
      }

      const result = await response.json();
      
      // The OCR endpoint returns: { data: { ocr: {...}, publicUrl, filePath } }
      if (!result.data || !result.data.ocr) {
        throw new Error('Certificate extraction failed - no OCR data returned');
      }

      logger.debug('Certificate extraction completed successfully', {
        ocrData: result.data.ocr,
        fileUrl: result.data.publicUrl
      });
      
      // Set the public URL for Save button
      setPublicUrl(result.data.publicUrl);
      
      // Map the OCR result to our state format
      const ocrData = result.data.ocr;
      setOcr({
        title: ocrData.title || '',
        institution: ocrData.institution || '',
        date_issued: ocrData.date_issued || '',
        description: ocrData.description || '',
        recipient: ocrData.recipient || '',
        certificate_id: ocrData.certificate_id || '',
        raw_text: ocrData.raw_text || '',
        confidence: ocrData.confidence || 0
      });
      
      // Show success message
      setSuccess('Certificate information extracted successfully!');
      
    } catch (err) {
      logger.error('Certificate extraction error', err);
      setError(err instanceof Error ? err.message : 'Failed to extract certificate information');
    } finally {
      setUploading(false);
    }
  }, [file]);

  const handleSave = useCallback(async () => {
    if (!ocr || !publicUrl) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    
    try {
      const payload = {
        publicUrl,
        ocr: {
          title: ocr.title,
          institution: ocr.institution,
          date_issued: ocr.date_issued,
          description: ocr.description,
          raw_text: ocr.raw_text,
          recipient: ocr.recipient,
          certificate_id: ocr.certificate_id,
          confidence: ocr.confidence
        }
      };

      logger.debug('Saving certificate', payload);

      // Call create API endpoint with extracted data
      const response = await fetch('/api/certificates/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save certificate');
      }
      
      const result = await response.json();
      
      if (result.data?.status === 'created') {
        setSuccess('Certificate saved successfully! Awaiting faculty approval.');
        // Reset will happen automatically after 3 seconds via useEffect
      } else {
        throw new Error('Unexpected response from server');
      }
      
    } catch (err) {
      logger.error('Save Error', err);
      setError(err instanceof Error ? err.message : 'Failed to save certificate');
    } finally {
      setSaving(false);
    }
  }, [ocr, publicUrl]);

  // Auto-reset form after successful save (only for save success, not extraction success)
  useEffect(() => {
    if (success && success.includes('saved successfully')) {
      const timer = setTimeout(() => {
        // Clear success message and reset form to initial state
        setSuccess(null);
        setFile(null);
        setOcr(null);
        setPublicUrl(null);
        setError(null);
      }, 3000); // 3 seconds

      return () => clearTimeout(timer);
    }
  }, [success]);

  // Deterministic particles to avoid hydration errors
  const particles = useMemo(() => [
    { top: '10%', left: '5%', duration: '4s', delay: '0s' },
    { top: '20%', right: '10%', duration: '5s', delay: '0.5s' },
    { top: '60%', left: '15%', duration: '3.5s', delay: '1s' },
    { bottom: '15%', right: '20%', duration: '4.5s', delay: '0.3s' },
    { bottom: '30%', left: '25%', duration: '5s', delay: '0.7s' },
  ], []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 relative overflow-hidden">
      {/* Floating particles with matching dashboard aesthetic */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {particles.map((particle, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 bg-blue-400/30 rounded-full blur-sm animate-float"
            style={{
              top: particle.top,
              left: particle.left,
              right: particle.right,
              bottom: particle.bottom,
              animationDuration: particle.duration,
              animationDelay: particle.delay,
            }}
          />
        ))}
        
        {/* Gradient orbs */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s' }}></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-emerald-500/20 to-blue-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '10s', animationDelay: '2s' }}></div>
        
        {/* Grid overlay */}
        <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:radial-gradient(white,transparent_85%)] opacity-10"></div>
      </div>

      {/* Navigation */}
      <nav className="relative z-10 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative w-10 h-10 transition-transform duration-300 group-hover:scale-110">
              <Image
                src="/logo-clean.svg"
                alt="CampusSync"
                width={40}
                height={40}
                className="w-full h-full object-contain transition-all duration-300 group-hover:brightness-110 group-hover:drop-shadow-[0_0_12px_rgba(59,130,246,0.5)]"
                priority
              />
            </div>
            <div className="flex flex-col -space-y-1">
              <span className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors duration-300">
                CampusSync
              </span>
              <span className="text-[9px] font-medium text-gray-400 tracking-wider uppercase">
                Verified Credentials
              </span>
            </div>
          </Link>

          {/* Back to Dashboard */}
          <Link
            href="/student/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white/80 hover:text-white transition-all duration-300 group backdrop-blur-sm"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span className="font-medium">Back to Dashboard</span>
          </Link>
        </div>
      </nav>

      <div className="relative z-10 py-6 px-6">
        <div className="max-w-4xl mx-auto">

          {/* Header Section with enhanced design matching dashboard */}
          <div className="text-center mb-12">
            <div className="flex flex-col items-center gap-4 mb-6">
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-2xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity duration-500" />
                <div className="relative p-4 bg-gradient-to-br from-blue-500/20 to-emerald-500/20 backdrop-blur-sm rounded-2xl border border-white/10 group-hover:scale-110 transition-transform duration-300">
                  <ScrollText className="w-10 h-10 text-blue-300 drop-shadow-lg" />
                </div>
              </div>
              <h1 className="text-4xl md:text-5xl font-extrabold bg-gradient-to-r from-blue-400 via-emerald-400 to-blue-400 bg-clip-text text-transparent animate-gradient">
                Upload Certificate
              </h1>
            </div>
            <p className="text-white/80 text-base md:text-lg max-w-2xl mx-auto leading-relaxed font-medium">
              Upload your certificates and let our AI extract the details automatically. 
              <span className="text-emerald-300"> Your achievements deserve recognition.</span>
            </p>
          </div>

          {/* Main Upload Card - Enhanced glassmorphism */}
          <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
            {/* Progress Indicator - Enhanced */}
            <div className="px-6 md:px-8 pt-6 md:pt-8">
              <div className="flex items-center justify-center mb-8">
                <div className="flex items-center gap-3 md:gap-4">
                  <div className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl transition-all duration-300 border ${
                    file ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30' : 'bg-white/5 text-white/60 border-white/10'
                  }`}>
                    <div className={`w-2 h-2 rounded-full transition-all ${file ? 'bg-emerald-400 animate-pulse' : 'bg-white/40'}`}></div>
                    <span className="text-sm font-semibold">Upload</span>
                  </div>
                  <div className={`w-8 md:w-12 h-1 rounded-full transition-all duration-500 ${
                    ocr ? 'bg-gradient-to-r from-emerald-400 to-blue-400' : 'bg-white/20'
                  }`}></div>
                  <div className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl transition-all duration-300 border ${
                    ocr ? 'bg-blue-500/20 text-blue-300 border-blue-400/30' : 'bg-white/5 text-white/60 border-white/10'
                  }`}>
                    <div className={`w-2 h-2 rounded-full transition-all ${ocr ? 'bg-blue-400 animate-pulse' : 'bg-white/40'}`}></div>
                    <span className="text-sm font-semibold">Extract</span>
                  </div>
                  <div className={`w-8 md:w-12 h-1 rounded-full transition-all duration-500 ${
                    success ? 'bg-gradient-to-r from-blue-400 to-emerald-400' : 'bg-white/20'
                  }`}></div>
                  <div className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl transition-all duration-300 border ${
                    success ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30' : 'bg-white/5 text-white/60 border-white/10'
                  }`}>
                    <div className={`w-2 h-2 rounded-full transition-all ${success ? 'bg-emerald-400 animate-pulse' : 'bg-white/40'}`}></div>
                    <span className="text-sm font-semibold">Save</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 md:px-8 pb-6 md:pb-8">
              {/* File Upload Zone - Enhanced */}
              <div 
                className={`relative border-2 border-dashed rounded-3xl p-8 md:p-12 text-center transition-all duration-300 group ${
                  dragActive 
                    ? 'border-blue-400 bg-blue-500/10 scale-105' 
                    : file 
                    ? 'border-emerald-400 bg-emerald-500/10 border-solid shadow-lg shadow-emerald-500/20' 
                    : 'border-white/20 hover:border-white/40 hover:bg-white/5'
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
                
                <div className="space-y-6">
                  <div className={`relative mx-auto w-20 h-20 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                    file ? 'bg-gradient-to-br from-emerald-500/30 to-blue-500/30 scale-110' : 'bg-white/5 group-hover:bg-white/10 group-hover:scale-105'
                  }`}>
                    {file ? (
                      <>
                        <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-blue-400 rounded-2xl blur-lg opacity-50 animate-pulse"></div>
                        <ScrollText className="relative w-10 h-10 text-emerald-300" />
                      </>
                    ) : (
                      <Upload className={`w-10 h-10 transition-colors ${
                        dragActive ? 'text-blue-300 animate-bounce' : 'text-white/60 group-hover:text-white/80'
                      }`} />
                    )}
                  </div>
                  
                  {file ? (
                    <div className="space-y-2">
                      <p className="text-emerald-300 text-lg md:text-xl font-bold">{file.name}</p>
                      <div className="flex items-center justify-center gap-2 text-white/70 text-sm">
                        <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                        <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                        <span>•</span>
                        <span className="text-emerald-300 font-medium">Ready to process</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-white text-lg md:text-xl font-bold flex items-center justify-center gap-2">
                        {dragActive ? (
                          <>
                            <Sparkles className="w-5 h-5 text-blue-300" />
                            <span>Drop your certificate here!</span>
                          </>
                        ) : (
                          <>
                            <ScrollText className="w-5 h-5 text-blue-300" />
                            <span>Drag & drop your certificate</span>
                          </>
                        )}
                      </p>
                      <p className="text-white/70 text-sm md:text-base">
                        or <span className="text-blue-300 font-semibold underline decoration-wavy decoration-blue-400/30">browse files</span>
                      </p>
                      <p className="text-white/50 text-xs md:text-sm">
                        Supports PDF, PNG, JPG, JPEG • Max 10MB
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* AI Features Info - Enhanced */}
              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl rounded-2xl border border-white/10 hover:border-blue-400/30 transition-all group">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-r from-blue-500/20 to-emerald-500/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Brain className="w-5 h-5 text-blue-300" />
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm">AI Extraction</p>
                      <p className="text-white/60 text-xs">Gemini Vision</p>
                    </div>
                  </div>
                </div>
                
                <div className="p-4 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl rounded-2xl border border-white/10 hover:border-emerald-400/30 transition-all group">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-r from-emerald-500/20 to-blue-500/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Zap className="w-5 h-5 text-emerald-300" />
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm">Fast Processing</p>
                      <p className="text-white/60 text-xs">5-10 seconds</p>
                    </div>
                  </div>
                </div>
                
                <div className="p-4 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl rounded-2xl border border-white/10 hover:border-emerald-400/30 transition-all group">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Shield className="w-5 h-5 text-emerald-300" />
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm">Secure Storage</p>
                      <p className="text-white/60 text-xs">Encrypted</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Verification removed - not needed in simplified flow */}

              {/* Action Buttons */}
              <div className="flex gap-4 mt-8">
                <button 
                  className={`group flex-1 relative overflow-hidden bg-gradient-to-r from-blue-500 to-emerald-500 text-white px-8 py-4 rounded-2xl font-semibold transition-all duration-300 hover:from-blue-600 hover:to-emerald-600 hover:shadow-xl hover:shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed ${
                    uploading ? 'animate-pulse' : 'hover:scale-105'
                  }`}
                  onClick={handleOcr} 
                  disabled={!file || uploading}
                >
                  <div className="flex items-center justify-center gap-3">
                    {uploading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        <span>Analyzing with AI... (this may take 5-10s)</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5" />
                        <span>Extract with Gemini AI</span>
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

              {/* Status Messages - Enhanced with auto-reset indicator */}
              {(error || success) && (
                <div className={`mt-6 p-5 rounded-2xl border bg-gradient-to-br backdrop-blur-xl transition-all duration-300 ${
                  error 
                    ? 'from-red-500/10 to-red-500/5 border-red-500/30 text-red-300' 
                    : 'from-emerald-500/10 to-emerald-500/5 border-emerald-500/30 text-emerald-300'
                }`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        error ? 'bg-red-500/20' : 'bg-emerald-500/20'
                      }`}>
                        {error ? (
                          <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        ) : (
                          <Check className="w-5 h-5 flex-shrink-0 animate-pulse" />
                        )}
                      </div>
                      <div>
                        <p className="font-semibold">{error || success}</p>
                        {success && success.includes('saved successfully') && (
                          <p className="text-xs text-white/60 mt-1">Resetting form in 3 seconds...</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* File Preview - Enhanced */}
              {publicUrl && (
                <div className="mt-6 p-5 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl rounded-2xl border border-white/10 hover:border-blue-400/30 transition-all group">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Eye className="w-6 h-6 text-blue-300" />
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-semibold mb-1">Certificate uploaded successfully</p>
                      <a 
                        href={publicUrl} 
                        target="_blank" 
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 text-blue-300 hover:text-blue-200 text-sm font-medium underline underline-offset-2 decoration-wavy decoration-blue-400/30 transition-colors group"
                      >
                        <span>View original file</span>
                        <Eye className="w-4 h-4 group-hover:scale-110 transition-transform" />
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* OCR Results - Enhanced */}
              {ocr && (
                <div className="mt-8 space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="relative group">
                      <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-blue-500 rounded-xl blur-lg opacity-40 group-hover:opacity-60 transition-opacity" />
                      <div className="relative w-12 h-12 bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-xl flex items-center justify-center">
                        <Sparkles className="w-6 h-6 text-purple-300" />
                      </div>
                    </div>
                    <div>
                      <h2 className="text-white text-xl md:text-2xl font-bold">AI Extracted Information</h2>
                      <p className="text-white/60 text-sm">Review and edit the details below</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Certificate Title */}
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-white/80">Certificate Title</label>
                      <input 
                        className="w-full bg-gradient-to-br from-white/10 to-white/5 border border-white/20 rounded-xl px-4 py-3.5 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 focus:bg-white/15 transition-all hover:bg-white/10" 
                        value={ocr.title ?? ''} 
                        onChange={e => setOcr({ ...ocr, title: e.target.value })}
                        placeholder="e.g., Machine Learning Certificate"
                      />
                    </div>

                    {/* Institution */}
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-white/80">Institution</label>
                      <input 
                        className="w-full bg-gradient-to-br from-white/10 to-white/5 border border-white/20 rounded-xl px-4 py-3.5 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400/50 focus:bg-white/15 transition-all hover:bg-white/10" 
                        value={ocr.institution ?? ''} 
                        onChange={e => setOcr({ ...ocr, institution: e.target.value })}
                        placeholder="e.g., Stanford University"
                      />
                    </div>

                    {/* Recipient Name */}
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-white/80">Recipient Name</label>
                      <input 
                        className="w-full bg-gradient-to-br from-white/10 to-white/5 border border-white/20 rounded-xl px-4 py-3.5 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400/50 focus:border-purple-400/50 focus:bg-white/15 transition-all hover:bg-white/10" 
                        value={ocr.recipient ?? ''} 
                        onChange={e => setOcr({ ...ocr, recipient: e.target.value })}
                        placeholder="e.g., John Doe"
                      />
                    </div>

                    {/* Date Issued */}
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-white/80">Date Issued</label>
                      <input 
                        type="date" 
                        className="w-full bg-gradient-to-br from-white/10 to-white/5 border border-white/20 rounded-xl px-4 py-3.5 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-cyan-400/50 focus:bg-white/15 transition-all hover:bg-white/10" 
                        value={ocr.date_issued ?? ''} 
                        onChange={e => setOcr({ ...ocr, date_issued: e.target.value })}
                      />
                    </div>

                    {/* Certificate ID */}
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-white/80">Certificate ID</label>
                      <input 
                        className="w-full bg-gradient-to-br from-white/10 to-white/5 border border-white/20 rounded-xl px-4 py-3.5 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400/50 focus:border-purple-400/50 focus:bg-white/15 transition-all hover:bg-white/10" 
                        value={ocr.certificate_id ?? ''} 
                        onChange={e => setOcr({ ...ocr, certificate_id: e.target.value })}
                        placeholder="e.g., CERT-2023-001 (if available)"
                      />
                    </div>

                    {/* Confidence Score (Read-only) - Enhanced */}
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-white/80">
                        AI Confidence Score
                        {typeof ocr.confidence === 'number' && (
                          <span className={`ml-2 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                            ocr.confidence > 0.8 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30' :
                            ocr.confidence > 0.6 ? 'bg-yellow-500/20 text-yellow-300 border-yellow-400/30' :
                            'bg-red-500/20 text-red-300 border-red-400/30'
                          }`}>
                            {(ocr.confidence * 100).toFixed(1)}%
                          </span>
                        )}
                      </label>
                      <div className="w-full bg-gradient-to-br from-white/10 to-white/5 border border-white/20 rounded-xl px-4 py-3.5 text-white/70 text-sm font-medium">
                        {typeof ocr.confidence === 'number' ? 
                          `${(ocr.confidence * 100).toFixed(1)}% - ${
                            ocr.confidence > 0.8 ? 'High confidence' :
                            ocr.confidence > 0.6 ? 'Medium confidence' :
                            'Low confidence - please review carefully'
                          }` : 
                          'No confidence score available'
                        }
                      </div>
                    </div>

                    {/* Description - Full width */}
                    <div className="space-y-2 md:col-span-2">
                      <label className="block text-sm font-semibold text-white/80">Description</label>
                      <textarea 
                        className="w-full bg-gradient-to-br from-white/10 to-white/5 border border-white/20 rounded-xl px-4 py-3.5 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 focus:bg-white/15 transition-all hover:bg-white/10 resize-none" 
                        rows={3} 
                        value={ocr.description ?? ''} 
                        onChange={e => setOcr({ ...ocr, description: e.target.value })}
                        placeholder="Brief description of the certificate or achievement..."
                      />
                    </div>
                  </div>

                  {/* Raw OCR text removed - not needed for users */}
                </div>
              )}
            </div>
          </div>

          {/* Footer - Enhanced */}
          <div className="text-center mt-12">
            <p className="text-white/60 text-sm md:text-base font-medium flex items-center justify-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>Your certificates are securely processed and stored.</span>
              <span className="text-emerald-300 font-semibold">Privacy guaranteed.</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}