"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Eye, EyeOff, KeyRound, Loader2, LockKeyhole, UserRound } from "lucide-react";

import type { SessionSnapshot, TwoFactorMethod } from "@/lib/vrchat/types";
import { ThemeToggle } from "./theme-toggle";

const methodLabels: Record<TwoFactorMethod, string> = {
    totp: "Authenticator code",
    otp: "Recovery code",
    emailOtp: "Email code",
};

export function LoginForm({ initialSession }: { initialSession: SessionSnapshot }) {
    const router = useRouter();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [methods, setMethods] = useState<TwoFactorMethod[]>(initialSession.status === "two-factor-required" ? initialSession.methods : []);
    const [method, setMethod] = useState<TwoFactorMethod>(initialSession.status === "two-factor-required" ? initialSession.methods[0] || "totp" : "totp");
    const [code, setCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function finishRequest(response: Response) {
        const payload = (await response.json()) as SessionSnapshot & { error?: string };
        if (!response.ok) {
            throw new Error(payload.error || "VRChat could not complete this request.");
        }
        if (payload.status === "two-factor-required") {
            setMethods(payload.methods);
            setMethod(payload.methods[0] || "totp");
            return;
        }
        if (payload.status === "authenticated") {
            router.replace("/");
            router.refresh();
        }
    }

    async function submitLogin(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setLoading(true);
        setError("");
        try {
            const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });
            await finishRequest(response);
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : "Login failed.");
        } finally {
            setLoading(false);
        }
    }

    async function submitTwoFactor(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setLoading(true);
        setError("");
        try {
            const response = await fetch("/api/auth/two-factor", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ method, code }),
            });
            await finishRequest(response);
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : "Verification failed.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="relative flex min-h-dvh items-center justify-center overflow-y-auto bg-background px-4 py-10">
            <div className="absolute top-2 left-2">
                <ThemeToggle />
            </div>
            <div className="w-full max-w-md">
                <div className="mb-4 flex items-center justify-center gap-3">
                    <Image src="/vrcx.png" alt="VRCX" width={44} height={44} className="rounded-xl shadow-lg" priority />
                    <div>
                        <p className="text-lg font-bold leading-tight">VRCX Web</p>
                        <p className="text-xs text-muted-foreground">Browser port</p>
                    </div>
                </div>
                <section className="rounded-xl border border-border bg-card p-5 shadow-xl sm:p-6" aria-labelledby="login-heading">
                    {methods.length ? (
                        <form onSubmit={submitTwoFactor}>
                            <div className="mb-5 text-center">
                                <KeyRound aria-hidden="true" className="mx-auto mb-2 size-7 text-primary" />
                                <h1 id="login-heading" className="text-xl font-bold">
                                    Two-factor authentication
                                </h1>
                                <p className="mt-1 text-xs text-muted-foreground">Enter the code requested by VRChat.</p>
                            </div>
                            {methods.length > 1 ? (
                                <label className="mb-3 block text-xs font-medium">
                                    Verification method
                                    <select value={method} onChange={(event) => setMethod(event.target.value as TwoFactorMethod)} className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                                        {methods.map((availableMethod) => (
                                            <option key={availableMethod} value={availableMethod}>
                                                {methodLabels[availableMethod]}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            ) : null}
                            <label className="block text-xs font-medium">
                                {methodLabels[method]}
                                <input
                                    value={code}
                                    onChange={(event) => setCode(event.target.value)}
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    autoFocus
                                    required
                                    className="mt-1.5 h-11 w-full rounded-md border border-input bg-background px-3 text-center font-mono text-lg tracking-[0.25em] outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                                    placeholder={method === "otp" ? "0000-0000" : "000000"}
                                />
                            </label>
                            {error ? <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">{error}</p> : null}
                            <button type="submit" disabled={loading || !code.trim()} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
                                {loading ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
                                Verify
                            </button>
                            <button type="button" onClick={() => setMethods([])} className="mt-2 h-9 w-full rounded-md text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                                Use another account
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={submitLogin}>
                            <h1 id="login-heading" className="mb-5 text-center text-xl font-bold">
                                Login
                            </h1>
                            <label className="block text-xs font-medium">
                                Username or email
                                <span className="relative mt-1.5 block">
                                    <UserRound aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                                    <input
                                        value={username}
                                        onChange={(event) => setUsername(event.target.value)}
                                        autoComplete="username"
                                        required
                                        className="h-11 w-full rounded-md border border-input bg-background pr-3 pl-9 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                                        placeholder="Username or email"
                                    />
                                </span>
                            </label>
                            <label className="mt-3 block text-xs font-medium">
                                Password
                                <span className="relative mt-1.5 block">
                                    <LockKeyhole aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                                    <input
                                        value={password}
                                        onChange={(event) => setPassword(event.target.value)}
                                        type={showPassword ? "text" : "password"}
                                        autoComplete="current-password"
                                        required
                                        className="h-11 w-full rounded-md border border-input bg-background pr-10 pl-9 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                                        placeholder="Password"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword((visible) => !visible)}
                                        className="absolute top-1/2 right-1 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                                        aria-label={showPassword ? "Hide password" : "Show password"}
                                    >
                                        {showPassword ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
                                    </button>
                                </span>
                            </label>
                            {error ? <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">{error}</p> : null}
                            <button type="submit" disabled={loading} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
                                {loading ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
                                Login
                            </button>
                            <a href="https://vrchat.com/register" target="_blank" rel="noreferrer" className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-md bg-secondary text-sm font-medium text-secondary-foreground transition hover:opacity-85">
                                Register with VRChat
                            </a>
                        </form>
                    )}
                </section>
                <div className="mt-4 text-center text-[11px] leading-5 text-muted-foreground">
                    <p>
                        <a href="https://vrchat.com/home/password" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                            Forgot password?
                        </a>
                    </p>
                    <p>© 2019–2026 pypy and individual VRCX contributors.</p>
                    <p>VRCX is not endorsed by VRChat Inc. or any of its affiliates.</p>
                    <p>Your credentials are sent directly to VRChat through this server and are not saved.</p>
                </div>
            </div>
        </main>
    );
}
