/**
 * Example Component with Comprehensive Error Handling
 * 
 * This component demonstrates best practices for error handling in CampusSync.
 * Use this as a reference when building new components.
 */

'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { AlertCircle, RefreshCw, CheckCircle } from 'lucide-react';
import { toast } from '@/components/ui/toast';
import { trackError } from '@/lib/errorMonitoring';
import { CVButton, CVAlert } from '@/components/ui';

interface DataItem {
  id: string;
  title: string;
  description: string;
}

export default function ExampleComponentWithErrorHandling() {
  // State management
  const [data, setData] = useState<DataItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  /**
   * Fetch data with proper error handling
   */
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null); // Clear previous errors
    
    try {
      const response = await fetch('/api/example/data');
      
      // Check if response is OK
      if (!response.ok) {
        const json = await response.json();
        throw new Error(json.error || `HTTP ${response.status}: Failed to fetch data`);
      }
      
      const json = await response.json();
      setData(json.data || []);
      
      // Optional: Show success toast
      toast.success('Data loaded', 'Successfully fetched latest data');
      
    } catch (e: unknown) {
      // Type-safe error handling
      const errorMessage = e instanceof Error ? e.message : 'Failed to load data';
      
      // Set error state for UI display
      setError(errorMessage);
      
      // Show user-friendly toast notification
      toast.error('Error loading data', errorMessage);
      
      // Track error for monitoring
      trackError(e as Error, 'medium', {
        component: 'ExampleComponent',
        action: 'fetchData',
        timestamp: new Date().toISOString()
      });
      
      // Log to console in development
      if (process.env.NODE_ENV === 'development') {
        console.error('[ExampleComponent] fetchData error:', e);
      }
    } finally {
      // Always reset loading state
      setLoading(false);
    }
  }, []);

  /**
   * Submit data with error handling and validation
   */
  const handleSubmit = async (formData: Partial<DataItem>) => {
    // Basic validation
    if (!formData.title?.trim()) {
      toast.error('Validation Error', 'Title is required');
      return;
    }

    setSubmitting(true);
    setError(null);
    
    try {
      const response = await fetch('/api/example/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
      
      if (!response.ok) {
        const json = await response.json();
        
        // Handle specific error cases
        if (response.status === 401) {
          throw new Error('You are not authenticated. Please log in.');
        }
        if (response.status === 403) {
          throw new Error('You do not have permission to perform this action.');
        }
        if (response.status === 409) {
          throw new Error('A record with this title already exists.');
        }
        
        throw new Error(json.error || 'Failed to submit data');
      }
      
      const json = await response.json();
      
      // Update local state
      setData(prev => [...prev, json.data]);
      
      // Show success feedback
      toast.success('Success!', 'Your data has been saved');
      
      // Reset form or redirect
      // router.push('/success');
      
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to submit data';
      setError(errorMessage);
      toast.error('Submission Failed', errorMessage);
      trackError(e as Error, 'high', {
        component: 'ExampleComponent',
        action: 'handleSubmit',
        formData
      });
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Delete with confirmation and error handling
   */
  const handleDelete = async (id: string) => {
    // User confirmation
    const confirmed = window.confirm('Are you sure you want to delete this item?');
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/example/data/${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const json = await response.json();
        throw new Error(json.error || 'Failed to delete item');
      }
      
      // Update local state
      setData(prev => prev.filter(item => item.id !== id));
      
      // Show success feedback
      toast.success('Deleted', 'Item has been removed');
      
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to delete item';
      toast.error('Delete Failed', errorMessage);
      trackError(e as Error, 'medium', {
        component: 'ExampleComponent',
        action: 'handleDelete',
        itemId: id
      });
    }
  };

  /**
   * Network error handler for offline detection
   * @param error - The error object to check
   * @returns User-friendly error message
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleNetworkError = (error: Error): string => {
    if (error.message.includes('fetch') || error.message.includes('Network')) {
      return 'Network error. Please check your internet connection and try again.';
    }
    return error.message;
  };

  // Load data on mount
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Render loading state
  if (loading && data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto"></div>
          <p className="text-white/70">Loading data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Error Display */}
      {error && (
        <CVAlert variant="error" className="animate-in slide-in-from-top-2 fade-in">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">Error</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
            <CVButton
              onClick={fetchData}
              variant="ghost"
              className="flex-shrink-0"
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              Retry
            </CVButton>
          </div>
        </CVAlert>
      )}

      {/* Success State */}
      {data.length > 0 && !error && (
        <CVAlert variant="success">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            <p>Loaded {data.length} items successfully</p>
          </div>
        </CVAlert>
      )}

      {/* Data Display */}
      <div className="grid gap-4">
        {data.map((item) => (
          <div
            key={item.id}
            className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 transition-colors"
          >
            <h3 className="text-white font-semibold">{item.title}</h3>
            <p className="text-white/70 text-sm mt-1">{item.description}</p>
            <div className="mt-3 flex gap-2">
              <CVButton
                onClick={() => handleDelete(item.id)}
                variant="secondary"
                className="bg-red-500/10 hover:bg-red-500/20 text-red-300"
              >
                Delete
              </CVButton>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {data.length === 0 && !loading && !error && (
        <div className="text-center py-12">
          <p className="text-white/50 text-lg">No data available</p>
          <CVButton onClick={fetchData} className="mt-4">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </CVButton>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        <CVButton
          onClick={fetchData}
          disabled={loading}
          variant="secondary"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh Data
        </CVButton>

        <CVButton
          onClick={() => handleSubmit({ title: 'New Item', description: 'Example' })}
          disabled={submitting}
        >
          {submitting ? 'Submitting...' : 'Add Item'}
        </CVButton>
      </div>
    </div>
  );
}

/**
 * Key Takeaways:
 * 
 * 1. Always use try-catch for async operations
 * 2. Check response.ok before parsing JSON
 * 3. Provide specific, user-friendly error messages
 * 4. Show loading states during operations
 * 5. Clear previous errors before new operations
 * 6. Use toast notifications for feedback
 * 7. Track errors for monitoring
 * 8. Handle edge cases (network errors, 401, 403, etc.)
 * 9. Always set loading to false in finally block
 * 10. Provide recovery options (retry, refresh, etc.)
 */
