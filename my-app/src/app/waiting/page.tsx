'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function WaitingPage() {
	const router = useRouter();
	const [dots, setDots] = useState('');
	const [userId, setUserId] = useState<string | null>(null);

	useEffect(() => {
		// Animate dots
		const dotsInterval = setInterval(() => {
			setDots(prev => prev.length >= 3 ? '' : prev + '.');
		}, 500);

		return () => {
			clearInterval(dotsInterval);
		};
	}, []);

	const redirectToRole = useCallback((role: string) => {
		console.log('[waiting] Role approved:', role, '- redirecting...');
		
		// Redirect based on role
		if (role === 'faculty') {
			router.push('/faculty/dashboard');
		} else if (role === 'recruiter') {
			router.push('/recruiter/dashboard');
		} else if (role === 'admin') {
			router.push('/admin/dashboard');
		} else {
			router.push('/dashboard');
		}
	}, [router]);

	useEffect(() => {
		// Get current user and set up realtime subscription
		const initUser = async () => {
			const { data: { user } } = await supabase.auth.getUser();
			if (user) {
				setUserId(user.id);
				
				// Check current status immediately
				const { data: roleData } = await supabase
					.from('user_roles')
					.select('role')
					.eq('user_id', user.id)
					.single();
				
				if (roleData?.role && roleData.role !== 'student') {
					redirectToRole(roleData.role);
				}
			}
		};
		
		initUser();
	}, [redirectToRole]);

	useEffect(() => {
		if (!userId) return;

		// Subscribe to realtime changes on user_roles table for this specific user
		const channel = supabase
			.channel(`role-changes-${userId}`)
			.on(
				'postgres_changes',
				{
					event: 'INSERT',
					schema: 'public',
					table: 'user_roles',
					filter: `user_id=eq.${userId}`,
				},
				(payload: any) => {
					console.log('[waiting] Role assigned via realtime:', payload);
					const newRole = payload.new?.role;
					if (newRole && newRole !== 'student') {
						redirectToRole(newRole);
					}
				}
			)
			.on(
				'postgres_changes',
				{
					event: 'UPDATE',
					schema: 'public',
					table: 'user_roles',
					filter: `user_id=eq.${userId}`,
				},
				(payload: any) => {
					console.log('[waiting] Role updated via realtime:', payload);
					const newRole = payload.new?.role;
					if (newRole && newRole !== 'student') {
						redirectToRole(newRole);
					}
				}
			)
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	}, [userId, redirectToRole]);

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
					<div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
					<span>Waiting for approval{dots}</span>
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


