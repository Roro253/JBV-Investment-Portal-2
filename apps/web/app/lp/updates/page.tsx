import type { Metadata } from "next";
import UpdatesTab from "@/components/jbv/UpdatesTab";

export const metadata: Metadata = {
  title: "JBV Updates — Limited Partner Experience",
  description: "Latest portfolio company and fund updates curated for JBV limited partners.",
};

export default function UpdatesPage() {
  return <UpdatesTab />;
}
