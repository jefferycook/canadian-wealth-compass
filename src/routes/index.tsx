import { createFileRoute, Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Northbound — Canadian Retirement & Tax Planning" },
      {
        name: "description",
        content:
          "Build an accurate Canadian retirement plan yourself: full federal and provincial tax, CPP, OAS clawback, RRIF minimums and LIF maximums, year by year to 95.",
      },
      { property: "og:title", content: "Northbound — Canadian Retirement & Tax Planning" },
      {
        property: "og:description",
        content:
          "A self-serve retirement planner built on real Canadian tax rules — CPP, OAS, RRSP/RRIF, TFSA, LIRA/LIF.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    title: "Real Canadian tax, not a rule of thumb",
    body: "Federal and provincial brackets, basic personal amount phase-outs, dividend gross-ups, the Ontario health premium, pension income splitting and the OAS recovery tax — applied year by year.",
  },
  {
    title: "Every account treated correctly",
    body: "RRSP and RRIF minimums from the statutory table, LIRA and LIF maximums with provincial unlocking rules, TFSA growth left untaxed, and adjusted cost base tracked on taxable accounts.",
  },
  {
    title: "The withdrawal order chosen for you",
    body: "The engine tests every drawdown order and keeps the one that funds the most years and leaves the most after tax — then shows you which it picked and why.",
  },
  {
    title: "Nothing pre-filled",
    body: "A new plan starts empty. Your ages, income, contribution room and balances are the only numbers in it, and they never leave your account.",
  },
];

function Landing() {
  return (
    <div className="min-h-svh bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-display text-lg font-semibold">Northbound</span>
        <Link to="/auth">
          <Button variant="ghost" size="sm">
            Sign in
          </Button>
        </Link>
      </header>

      <main>
        <section className="mx-auto max-w-3xl px-6 py-20 text-center">
          <p className="mb-4 text-sm uppercase tracking-[0.18em] text-muted-foreground">
            For Canadians, in Canadian dollars
          </p>
          <h1 className="text-balance text-5xl leading-tight sm:text-6xl">
            Know exactly what retirement looks like.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Answer six short steps about your life and money. Get a year-by-year projection built
            on the actual tax rules — CPP timing, OAS clawback, RRIF minimums, LIF maximums, and
            the drawdown order that keeps the most in your pocket.
          </p>
          <div className="mt-10 flex justify-center gap-3">
            <Link to="/auth">
              <Button size="lg">Build my plan</Button>
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            No advisor, no appointment. Free to start.
          </p>
        </section>

        <section className="mx-auto grid max-w-5xl gap-6 px-6 pb-24 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <Card key={f.title}>
              <CardContent className="pt-6">
                <h2 className="text-xl">{f.title}</h2>
                <p className="mt-2 text-muted-foreground">{f.body}</p>
              </CardContent>
            </Card>
          ))}
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-muted-foreground">
          Northbound is a planning tool, not financial, tax or legal advice. Projections are
          estimates based on the assumptions you enter.
        </div>
      </footer>
    </div>
  );
}
