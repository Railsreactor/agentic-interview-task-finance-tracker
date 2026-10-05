import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { m } from "#/paraglide/messages";
import { formatMinor } from "#/lib/money";
import { getReceiptWithItems, getReceiptImage } from "#/server/receipts.functions";
import { CategoryBadge } from "#/components/ui/category-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table";


const RECEIPT_VIEWER_QUERY_KEY = ["receipt-viewer"] as const;

interface ReceiptItem {
  id: string;
  receipt_id: string;
  name: string;
  quantity: number | null;
  /** Integer minor units (grosze/cents). */
  unit_price_minor: number | null;
  total_price_minor: number;
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  created_at: Date | null;
}

interface ReceiptMetadata {
  storeName: string;
  date: string;
  /** Integer minor units (grosze/cents). */
  totalMinor: number;
}

export const Route = createFileRoute("/_authed/receipts/view/$transactionId")({
  component: ReceiptViewerPage,
});

function ReceiptViewerPage() {
  const { transactionId } = Route.useParams();
  const getReceiptWithItemsFn = useServerFn(getReceiptWithItems);
  const getReceiptImageFn = useServerFn(getReceiptImage);

  const { data, isLoading, error } = useQuery({
    queryKey: [...RECEIPT_VIEWER_QUERY_KEY, transactionId],
    queryFn: () =>
      getReceiptWithItemsFn({ data: { transactionId } }),
    enabled: !!transactionId,
  });

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);

  useEffect(() => {
    if (data && "success" in data && data.success && data.receipt.image_path) {
      setImageLoading(true);
      setImageSrc(null);
      getReceiptImageFn({ data: { receiptId: data.receipt.id } })
        .then((result) => {
          if (result && "success" in result && result.success) {
            setImageSrc(`data:${result.contentType};base64,${result.data}`);
          }
        })
        .finally(() => setImageLoading(false));
    }
  }, [data, getReceiptImageFn]);

  const hasError = error != null || (data && "error" in data);

  return (
    <div className="min-h-screen">
      <header className="border-b border-line/50 bg-header-bg/80 backdrop-blur-sm">
        <div className="page-wrap py-4 flex items-center gap-4">
          <Link
            to="/transactions"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <svg
              className="size-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            {m.receipt_view_back()}
          </Link>
          <h1 className="text-xl font-bold display-title">
            {m.receipt_view_title()}
          </h1>
        </div>
      </header>

      <main className="page-wrap py-8">
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <div className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-muted-foreground">
                {m.loading()}
              </span>
            </div>
          </div>
        )}

        {hasError && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <svg
              className="size-12 text-muted-foreground/40 mb-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
              />
            </svg>
            <h3 className="text-base font-medium mb-1">
              {m.receipt_view_not_found()}
            </h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              {m.receipt_view_not_found_desc()}
            </p>
            <Link
              to="/transactions"
              className="h-9 px-4 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-2"
            >
              {m.receipt_view_back()}
            </Link>
          </div>
        )}

        {data && "success" in data && data.success && (
          <ReceiptViewerContent
            metadata={data.metadata}
            items={data.items}
            imageSrc={imageSrc}
            imageLoading={imageLoading}
          />
        )}
      </main>
    </div>
  );
}

function ReceiptViewerContent({
  metadata,
  items,
  imageSrc,
  imageLoading,
}: {
  metadata: ReceiptMetadata;
  items: ReceiptItem[];
  imageSrc: string | null;
  imageLoading: boolean;
}) {
  const itemsTotal = items.reduce(
    (sum, item) => sum + item.total_price_minor,
    0,
  );
  const delta = itemsTotal - metadata.totalMinor;
  const deltaExceedsThreshold = Math.abs(delta) > 50;

  const formatCurrency = (amountMinor: number): string => {
    return formatMinor(amountMinor);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Image */}
        <div className="island-shell rounded-xl p-4">
          <h2 className="text-base font-semibold mb-3">
            {m.scan_image_preview()}
          </h2>
          {imageLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : imageSrc ? (
            <img
              src={imageSrc}
              alt={m.scan_image_preview()}
              className="w-full rounded-lg max-h-[500px] object-contain bg-muted/30"
            />
          ) : (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
              {m.receipt_view_no_image()}
            </div>
          )}
        </div>

        {/* Metadata + Items */}
        <div className="island-shell rounded-xl p-4">
          <h2 className="text-base font-semibold mb-4">
            {m.scan_extracted_data()}
          </h2>

          {/* Store info */}
          <div className="space-y-3 mb-6">
            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                {m.scan_store_name()}
              </span>
              <p className="mt-0.5 text-sm">{metadata.storeName || "—"}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                {m.scan_date()}
              </span>
              <p className="mt-0.5 text-sm">{metadata.date || "—"}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                {m.scan_receipt_total()}
              </span>
              <p className="mt-0.5 text-sm">
                {formatCurrency(metadata.totalMinor)} PLN
              </p>
            </div>
          </div>

          {/* Items table */}
          {items.length > 0 && (
            <>
              <h3 className="text-sm font-semibold mb-2">
                {m.scan_items()} ({items.length})
              </h3>
              <div className="overflow-x-auto mb-4">
                <Table className="w-full text-sm">
                  <TableHeader>
                    <TableRow className="border-b border-line/50">
                      <TableHead
                        className="text-left py-2 pr-2 text-xs text-muted-foreground font-medium"
                       
                      >
                        {m.scan_item_name()}
                      </TableHead>
                      <TableHead
                        className="text-right py-2 px-2 text-xs text-muted-foreground font-medium w-24"
                       
                      >
                        {m.scan_total_price()}
                      </TableHead>
                      <TableHead
                        className="text-left py-2 pl-2 text-xs text-muted-foreground font-medium"
                       
                      >
                        {m.scan_category()}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow
                        key={item.id}
                        className="border-b border-line/30 last:border-0"
                      >
                        <TableCell className="py-1.5 pr-2 text-sm">{item.name}</TableCell>
                        <TableCell className="py-1.5 px-2 text-sm text-right font-mono tabular-nums">
                          {formatCurrency(item.total_price_minor)}
                        </TableCell>
                        <TableCell className="py-1.5 pl-2">
                          <CategoryBadge
                            name={item.category_name ?? null}
                            color={item.category_color ?? null}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Running total bar */}
              <div
                className={`p-3 rounded-md text-sm ${
                  deltaExceedsThreshold
                    ? "bg-amber-500/10 text-amber-600"
                    : "bg-muted/50 text-muted-foreground"
                }`}
              >
                <span>
                  {m.scan_items()} total: {formatCurrency(itemsTotal)} PLN
                  vs {m.scan_receipt_total()}:{" "}
                  {formatCurrency(metadata.totalMinor)} PLN
                </span>
                {deltaExceedsThreshold && (
                  <span className="ml-2">
                    (delta: {formatCurrency(delta)} PLN)
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
