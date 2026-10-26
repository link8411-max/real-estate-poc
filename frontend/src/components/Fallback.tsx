import type { LucideIcon } from "lucide-react";

/** 404·에러 화면 공통 틀 */
export default function Fallback({
  icon: Icon,
  title,
  message,
  children,
}: {
  icon: LucideIcon;
  title: string;
  message: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
        <Icon className="h-6 w-6 text-blue-600" aria-hidden />
      </div>
      <h1 className="text-xl font-bold text-gray-900">{title}</h1>
      <p className="mt-2 text-sm text-gray-500">{message}</p>
      <div className="mt-6 flex gap-2">{children}</div>
    </main>
  );
}

export const primaryButton =
  "rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700";
export const secondaryButton =
  "rounded-xl bg-gray-100 px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-200";
