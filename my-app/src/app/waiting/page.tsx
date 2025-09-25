export default function WaitingPage() {
	return (
		<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 px-6">
			<div className="max-w-lg w-full bg-white/5 border border-white/20 rounded-2xl p-8 text-center text-white">
				<h1 className="text-2xl font-bold">Thanks! Your access request is pending</h1>
				<p className="mt-3 text-white/80">An administrator will review your request shortly. You’ll be notified when it’s approved.</p>
			</div>
		</div>
	);
}


