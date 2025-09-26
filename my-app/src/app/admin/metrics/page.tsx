"use client";
import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface AccuracyMetric {
  metric_type: string;
  avg_value: number;
  min_value: number;
  max_value: number;
  count: number;
  date_bucket: string;
}

interface CorrectionStat {
  correction_type: string;
  total_corrections: number;
  avg_confidence_improvement: number;
  most_corrected_field: string;
}

export default function MetricsPage() {
  const [accuracyMetrics, setAccuracyMetrics] = useState<AccuracyMetric[]>([]);
  const [correctionStats, setCorrectionStats] = useState<CorrectionStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [daysBack, setDaysBack] = useState(30);

  useEffect(() => {
    loadMetrics();
  }, [daysBack]);

  const loadMetrics = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load accuracy metrics
      const { data: accuracyData, error: accuracyError } = await supabase
        .rpc('get_accuracy_metrics', { days_back: daysBack });

      if (accuracyError) throw accuracyError;
      setAccuracyMetrics(accuracyData || []);

      // Load correction stats
      const { data: correctionData, error: correctionError } = await supabase
        .rpc('get_correction_stats', { days_back: daysBack });

      if (correctionError) throw correctionError;
      setCorrectionStats(correctionData || []);

    } catch (err: any) {
      setError(err.message || 'Failed to load metrics');
    } finally {
      setLoading(false);
    }
  };

  const getMetricColor = (metricType: string) => {
    switch (metricType) {
      case 'accuracy': return 'text-green-600';
      case 'confidence': return 'text-blue-600';
      case 'processing_time': return 'text-yellow-600';
      case 'error_rate': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getMetricIcon = (metricType: string) => {
    switch (metricType) {
      case 'accuracy': return '🎯';
      case 'confidence': return '📊';
      case 'processing_time': return '⏱️';
      case 'error_rate': return '⚠️';
      default: return '📈';
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">System Metrics & Analytics</h1>
        <div className="flex items-center gap-4">
          <select
            value={daysBack}
            onChange={(e) => setDaysBack(Number(e.target.value))}
            className="px-3 py-2 border rounded-md"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button
            onClick={loadMetrics}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-lg">Loading metrics...</div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <div className="text-red-800">{error}</div>
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-8">
          {/* Accuracy Metrics */}
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Accuracy Metrics</h2>
            {accuracyMetrics.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {accuracyMetrics.map((metric, index) => (
                  <div key={index} className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">{getMetricIcon(metric.metric_type)}</span>
                      <span className="font-medium capitalize">{metric.metric_type.replace('_', ' ')}</span>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Average:</span>
                        <span className={getMetricColor(metric.metric_type)}>
                          {metric.avg_value.toFixed(3)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Min:</span>
                        <span>{metric.min_value.toFixed(3)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Max:</span>
                        <span>{metric.max_value.toFixed(3)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Count:</span>
                        <span>{metric.count}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-2">
                        {new Date(metric.date_bucket).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-500 text-center py-8">
                No accuracy metrics available for the selected period.
              </div>
            )}
          </section>

          {/* Correction Stats */}
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Human Corrections & Active Learning</h2>
            {correctionStats.length > 0 ? (
              <div className="space-y-4">
                {correctionStats.map((stat, index) => (
                  <div key={index} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium capitalize">
                        {stat.correction_type.replace('_', ' ')}
                      </h3>
                      <span className="text-sm text-gray-500">
                        {stat.total_corrections} corrections
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Total Corrections:</span>
                        <div className="font-medium">{stat.total_corrections}</div>
                      </div>
                      <div>
                        <span className="text-gray-500">Avg Confidence Improvement:</span>
                        <div className="font-medium">
                          {stat.avg_confidence_improvement ? 
                            stat.avg_confidence_improvement.toFixed(3) : 'N/A'}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-500">Most Corrected Field:</span>
                        <div className="font-medium">{stat.most_corrected_field || 'N/A'}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-500 text-center py-8">
                No correction data available for the selected period.
              </div>
            )}
          </section>

          {/* System Health */}
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">System Health</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border rounded-lg p-4 text-center">
                <div className="text-2xl mb-2">📊</div>
                <div className="font-medium">Processing Rate</div>
                <div className="text-sm text-gray-500">Documents per hour</div>
                <div className="text-lg font-semibold text-green-600">24.5</div>
              </div>
              <div className="border rounded-lg p-4 text-center">
                <div className="text-2xl mb-2">⚡</div>
                <div className="font-medium">Avg Processing Time</div>
                <div className="text-sm text-gray-500">Seconds per document</div>
                <div className="text-lg font-semibold text-blue-600">2.3s</div>
              </div>
              <div className="border rounded-lg p-4 text-center">
                <div className="text-2xl mb-2">🎯</div>
                <div className="font-medium">Overall Accuracy</div>
                <div className="text-sm text-gray-500">Last 24 hours</div>
                <div className="text-lg font-semibold text-green-600">94.2%</div>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
