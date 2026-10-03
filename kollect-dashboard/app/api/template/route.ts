import { buildTemplate } from "@/lib/excel";

export async function GET() {
  return new Response(new Uint8Array(buildTemplate()), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="kollect-data-template.xlsx"',
    },
  });
}
