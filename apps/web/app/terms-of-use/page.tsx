import Link from "next/link";

export const metadata = {
  title: "Terms of Use | JBV Investment Capital Limited Partner Portal",
  description:
    "Terms of Use governing access to and use of the JBV Investment Capital Limited Partner Portal, including the restricted access legal disclaimer.",
};

const EFFECTIVE_DATE = "September 17, 2025";
const LAST_UPDATED = "September 17, 2025";

export default function TermsOfUsePage() {
  return (
    <div className="bg-slate-50">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <header className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-blue-600">Compliance Notice</p>
          <h1 className="text-3xl font-semibold text-slate-900">Terms of Use of JBV Investment Capital Limited Partner Portal</h1>
          <div className="text-sm text-slate-500">
            <p>Effective Date: {EFFECTIVE_DATE}</p>
            <p>Last Updated: {LAST_UPDATED}</p>
          </div>
        </header>

        <div className="mt-10 space-y-6 text-sm leading-6 text-slate-700">
          <p>
            These Terms of Use (the “Terms”) govern the access to and use of the Limited Partner Portal (the “Portal”)
            maintained by JBV Investment Capital, together with its affiliates (collectively, “JBV,” “we,” “our,” or “us”).
            By accessing the Portal, each user (“you” or the “User”) acknowledges that he, she, or it has read, understood,
            and agrees to be bound by these Terms. If you do not agree, you are not authorized to access the Portal.
          </p>
          <p>
            Access to the Portal is provided exclusively to Limited Partners of JBV-sponsored investment vehicles and their
            expressly authorized representatives. Each User is responsible for maintaining the confidentiality of his, her,
            or its login credentials and for all activities conducted under such credentials. Unauthorized access to or use
            of the Portal is strictly prohibited.
          </p>
          <p>
            The Portal contains confidential and proprietary materials relating to JBV investment vehicles, including
            without limitation financial reports, capital account statements, performance data, and related documents. Such
            materials are made available solely for informational purposes in connection with your investment relationship
            with JBV. Nothing contained on the Portal shall constitute investment advice, an offer to sell, or a
            solicitation of an offer to purchase any security or investment product. You acknowledge that past performance
            is not indicative of future results and agree that you shall not rely upon the Portal or its contents as a
            substitute for independent judgment in making investment or financial decisions.
          </p>
          <p>
            You agree to maintain the confidentiality of all information obtained through the Portal and not to disclose
            such information to any third party without the prior written consent of JBV, except where disclosure is
            required by applicable law or regulation. You further agree not to attempt to gain unauthorized access to the
            Portal, to interfere with its operation, or to use the Portal in violation of applicable law.
          </p>
          <p>
            All intellectual property rights in and to the Portal and its content are owned by or licensed to JBV. No right,
            title, or interest is transferred to you by virtue of access to the Portal, other than the limited right to use
            the Portal in accordance with these Terms. Any reproduction, distribution, modification, or other use of Portal
            content without the prior written authorization of JBV is prohibited.
          </p>
          <p>
            To the fullest extent permitted by law, JBV disclaims all liability for any losses, damages, or claims arising
            out of or relating to your use or inability to use the Portal, including without limitation damages arising from
            errors, inaccuracies, interruptions, unauthorized access, or delays.
          </p>
          <p>
            JBV reserves the right, in its sole discretion and without notice, to suspend or terminate your access to the
            Portal in the event of any breach of these Terms or where such action is otherwise deemed necessary or
            appropriate by JBV.
          </p>
          <p>
            These Terms shall be governed by, and construed in accordance with, the laws of the State of New York, without
            regard to conflicts of law principles. Any disputes arising hereunder shall be subject to the exclusive
            jurisdiction of the state and federal courts located within New York County, New York.
          </p>
          <p>
            JBV may amend these Terms at any time, and such amendments shall become effective upon their posting to the
            Portal. Your continued access to the Portal following the posting of amendments shall constitute your acceptance
            of the Terms as amended.
          </p>
          <p>
            Inquiries concerning these Terms should be directed to:
          </p>
          <address className="not-italic text-sm text-slate-700">
            <div>JBV Investment Capital – Legal Department</div>
            <div>405 Lexington Avenue, 32nd Floor</div>
            <div>New York, NY 10174</div>
            <div>
              Email: {" "}
              <a className="font-semibold text-blue-600 hover:underline" href="mailto:legal@jbvcapital.com">
                legal@jbvcapital.com
              </a>
            </div>
          </address>
        </div>

        <section className="mt-10 space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Restricted Access Legal Disclaimer</h2>
          <p className="text-sm leading-6 text-slate-700">
            The Limited Partner Portal of JBV Investment Capital (the “Portal”) is a proprietary system intended solely for
            use by Limited Partners of investment vehicles sponsored or advised by JBV Investment Capital and by those
            persons who have been expressly authorized by such Limited Partners. Access to and use of the Portal by any
            other person is strictly prohibited.
          </p>
          <p className="text-sm leading-6 text-slate-700">
            By proceeding beyond this page, you represent and warrant that you are an authorized user of the Portal, that
            you are accessing the Portal solely in connection with your investment relationship with JBV Investment
            Capital, and that you will comply with all applicable terms, conditions, and restrictions governing such
            access.
          </p>
          <p className="text-sm leading-6 text-slate-700">
            The Portal and all information contained herein are confidential and constitute proprietary and trade secret
            material of JBV Investment Capital. Unauthorized access to, or use of, the Portal or its contents may
            constitute a violation of applicable laws and regulations, and may subject the violator to civil and criminal
            penalties. JBV Investment Capital reserves the right to monitor, record, and audit all activity on the Portal
            and to pursue any remedies available under law or equity in the event of unauthorized use.
          </p>
          <p className="text-sm leading-6 text-slate-700">
            If you are not an authorized user, you must not attempt to access the Portal and are instructed to exit
            immediately.
          </p>
          <p className="text-xs text-slate-500">
            For information about how JBV Investment Capital handles personal data within the Portal, please consult the {" "}
            <Link className="font-semibold text-blue-600 hover:underline" href="/privacy-policy">
              Privacy Policy
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
