import { ExtensionInstallPanel } from "@/components/extension-install-panel";
import { ExtensionPageToaster } from "@/components/extension-page-toaster";
import { ExtensionTokensPanel } from "@/components/extension-tokens-panel";
import { PageContainer } from "@/components/layout/page-container";

type Props = { params: Promise<{ teamId: string }> };

export default async function TeamExtensionPage({ params }: Props) {
  await params;
  return (
    <PageContainer>
      <ExtensionInstallPanel />
      <ExtensionTokensPanel />
      <ExtensionPageToaster />
    </PageContainer>
  );
}
