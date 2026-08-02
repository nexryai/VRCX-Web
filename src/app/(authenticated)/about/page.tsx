import type { Metadata } from "next";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
    return (
        <article className="h-full overflow-y-auto p-4 sm:p-6">
            <div className="mx-auto max-w-3xl space-y-5">
                <header>
                    <h1 className="text-xl font-semibold">About VRCX Web</h1>
                    <p className="mt-2 text-sm text-muted-foreground">A browser port of the remote-capable parts of VRCX for trusted-network deployment.</p>
                </header>
                <section className="rounded-xl border border-border bg-card p-4">
                    <h2 className="text-sm font-semibold">VRCX attribution</h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">This project reuses and adapts the VRCX visual design, application icon, behavior, and portions of its MIT-licensed source code.</p>
                    <p className="mt-3 text-xs">Copyright © 2019–2026 pypy and individual contributors.</p>
                    <a href="https://github.com/vrcx-team/VRCX" target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm text-primary hover:underline">
                        Original VRCX source
                    </a>
                </section>
                <section className="rounded-xl border border-border bg-card p-4">
                    <h2 className="text-sm font-semibold">MIT License</h2>
                    <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{`Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.`}</p>
                    <p className="mt-3 text-xs text-muted-foreground">The complete copied license notice is distributed in THIRD_PARTY_NOTICES.md.</p>
                </section>
            </div>
        </article>
    );
}
