"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building, Calendar, GraduationCap, MapPin, Star, User2, ArrowRight } from "lucide-react";

export default function OnboardingPage() {
	const router = useRouter();
	const [fullName, setFullName] = useState("");
	const [university, setUniversity] = useState("");
	const [graduationYear, setGraduationYear] = useState("");
	const [major, setMajor] = useState("");
	const [location, setLocation] = useState("");
	const [gpa, setGpa] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function submit() {
		setError(null);
		setLoading(true);
		try {
			const resp = await fetch('/api/profile/complete', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					full_name: fullName.trim(),
					university: university.trim() || undefined,
					graduation_year: graduationYear ? Number(graduationYear) : undefined,
					major: major.trim() || undefined,
					location: location.trim() || undefined,
					gpa: gpa ? Number(gpa) : undefined,
				})
			});
			if (!resp.ok) {
				const js = await resp.json().catch(() => ({ error: undefined })) as { error?: string };
				throw new Error(js?.error || 'Failed to save profile');
			}
			router.replace('/dashboard');
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : 'Failed');
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="min-h-screen px-6 py-10 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
			<div className="max-w-2xl mx-auto bg-white/5 border border-white/20 rounded-2xl p-6 sm:p-8 backdrop-blur-xl">
				<h1 className="text-white text-2xl font-bold flex items-center gap-3"><User2 className="w-6 h-6"/> Complete your profile</h1>
				<p className="text-white/70 mt-2">This helps recruiters discover you faster.</p>

				<div className="mt-6 space-y-5">
					<div>
						<label className="cv-form-label text-white font-semibold" htmlFor="full_name">Full Name</label>
						<input id="full_name" className="cv-form-input bg-white/90 text-gray-900" value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Jane Doe" required />
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<label className="cv-form-label text-white font-semibold" htmlFor="university">University</label>
							<div className="cv-input-wrapper">
								<Building className="cv-input-icon" />
								<input id="university" className="cv-form-input pl-10 bg-white/90 text-gray-900" value={university} onChange={e=>setUniversity(e.target.value)} placeholder="Stanford University" />
							</div>
						</div>
						<div>
							<label className="cv-form-label text-white font-semibold" htmlFor="graduation_year">Graduation Year</label>
							<div className="cv-input-wrapper">
								<Calendar className="cv-input-icon" />
								<input id="graduation_year" type="number" min="1900" max="2100" className="cv-form-input pl-10 bg-white/90 text-gray-900" value={graduationYear} onChange={e=>setGraduationYear(e.target.value)} placeholder="2026" />
							</div>
						</div>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<label className="cv-form-label text-white font-semibold" htmlFor="major">Major</label>
							<div className="cv-input-wrapper">
								<GraduationCap className="cv-input-icon" />
								<input id="major" className="cv-form-input pl-10 bg-white/90 text-gray-900" value={major} onChange={e=>setMajor(e.target.value)} placeholder="Computer Science" />
							</div>
						</div>
						<div>
							<label className="cv-form-label text-white font-semibold" htmlFor="location">Location</label>
							<div className="cv-input-wrapper">
								<MapPin className="cv-input-icon" />
								<input id="location" className="cv-form-input pl-10 bg-white/90 text-gray-900" value={location} onChange={e=>setLocation(e.target.value)} placeholder="Palo Alto, CA" />
							</div>
						</div>
					</div>

					<div>
						<label className="cv-form-label text-white font-semibold" htmlFor="gpa">GPA (optional)</label>
						<div className="cv-input-wrapper">
							<Star className="cv-input-icon" />
							<input id="gpa" type="number" step="0.01" min="0" max="10" className="cv-form-input pl-10 bg-white/90 text-gray-900" value={gpa} onChange={e=>setGpa(e.target.value)} placeholder="8.5" />
						</div>
					</div>
				</div>

				{error && <p className="mt-4 text-red-300">{error}</p>}

				<button onClick={submit} disabled={loading || !fullName.trim()} className="mt-6 w-full group bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-4 rounded-lg font-semibold hover:from-blue-600 hover:to-purple-700 transition-all duration-300 flex items-center justify-center gap-2">
					<span>{loading ? 'Saving...' : 'Save and continue'}</span>
					<ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
				</button>
			</div>
		</div>
	);
}


