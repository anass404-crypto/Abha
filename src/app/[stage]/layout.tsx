import { notFound } from "next/navigation";
import { getStageBySlug } from "@/lib/stage";
import { stageCssVars } from "@/lib/theme";
import { StageProvider } from "@/lib/stage-context";
import { StageBottomNav } from "@/components/nav/stage-bottom-nav";
import { BrandStrip } from "@/components/nav/brand-strip";

export default async function StageLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ stage: string }>;
}) {
  const { stage: slug } = await params;
  const stage = await getStageBySlug(slug);
  if (!stage) notFound();

  return (
    <div style={stageCssVars(stage.colors) as React.CSSProperties} className="flex min-h-screen flex-col">
      <StageProvider stage={stage}>
        <BrandStrip stageName={stage.name} />
        {children}
        <StageBottomNav
          slug={stage.slug}
          showLeaderboard={stage.show_leaderboard}
          enableActionCards={stage.enable_action_cards}
        />
      </StageProvider>
    </div>
  );
}
