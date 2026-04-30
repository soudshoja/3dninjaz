import { FontUploader } from "@/components/admin/font-uploader";
import { FontsTable } from "@/components/admin/fonts-table";
import { listCustomFonts } from "@/actions/custom-fonts";

export const metadata = { title: "Custom Fonts" };
export const dynamic = "force-dynamic";

export default async function AdminFontsPage() {
  const fonts = await listCustomFonts(false);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--color-brand-text-primary)]">
          Custom Fonts
        </h1>
        <p className="mt-1 text-sm text-[var(--color-brand-text-muted)]">
          Upload brand .woff2/.woff fonts. Active fonts appear in the product
          description editor and are rendered on the storefront.
        </p>
      </div>

      <FontUploader />

      {fonts.length > 0 ? (
        <FontsTable fonts={fonts} />
      ) : (
        <p className="text-sm text-[var(--color-brand-text-muted)]">
          No custom fonts uploaded yet.
        </p>
      )}
    </div>
  );
}
