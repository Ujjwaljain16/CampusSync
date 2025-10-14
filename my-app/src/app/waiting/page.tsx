'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function WaitingPage() {
	const router = useRouter();
	const [checking, setChecking] = useState(false);
	const [dots, setDots] = useState('');

	useEffect(() => {
		// Animate dots
		const dotsInterval = setInterval(() => {
			setDots(prev => prev.length >= 3 ? '' : prev + '.');
		}, 500);

		// Check approval status every 3 seconds
		const checkApproval = async () => {
			if (checking) return;
			
			setChecking(true);
			try {
				const response = await fetch('/api/user/role-status');
				const data = await response.json();
				
				// If user has a non-student role that's been approved, redirect
				if (data.role && data.role !== 'student') {
					console.log('[waiting] Role approved:', data.role, '- redirecting...');
					
					// Redirect based on role
					if (data.role === 'faculty') {
						router.push('/faculty/dashboard');
					} else if (data.role === 'recruiter') {
						router.push('/recruiter/dashboard');
					} else if (data.role === 'admin') {
						router.push('/admin/dashboard');
					} else {
						router.push('/dashboard');
					}
					return;
				}
			} catch (error) {
				console.error('[waiting] Error checking status:', error);
			} finally {
				setChecking(false);
			}
		};

		// Check immediately on mount
		checkApproval();

		// Then check every 3 seconds
		const approvalInterval = setInterval(checkApproval, 3000);

		return () => {
			clearInterval(dotsInterval);
			clearInterval(approvalInterval);
		};
	}, [router, checking]);

	return (
		<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 px-6">
			<div className="max-w-lg w-full bg-white/5 border border-white/20 rounded-2xl p-8 text-center text-white">
				<div className="mb-6">
					<div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-500/20 flex items-center justify-center">
						<svg className="w-8 h-8 text-purple-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
					</div>
				</div>
				
				<h1 className="text-2xl font-bold">Thanks! Your access request is pending</h1>
				<p className="mt-3 text-white/80">
					An administrator will review your request shortly. You'll be notified when it's approved.
				</p>
				
				<div className="mt-6 flex items-center justify-center gap-2 text-sm text-white/60">
					<div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
					<span>Checking for approval{dots}</span>
				</div>
				
				<div className="mt-8 pt-6 border-t border-white/10">
					<p className="text-xs text-white/50">
						You can close this page. We'll send you an email once your request is approved.
					</p>
				</div>
			</div>
		</div>
	);
}


