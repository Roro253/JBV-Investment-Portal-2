import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | JBV Investment Capital Limited Partner Portal",
  description:
    "Privacy Policy governing the collection, processing, and protection of information within the JBV Investment Capital Limited Partner Portal.",
};

const EFFECTIVE_DATE = "September 17, 2025";

export default function PrivacyPolicyPage() {
  return (
    <div className="bg-slate-50">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <header className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-blue-600">Compliance Notice</p>
          <h1 className="text-3xl font-semibold text-slate-900">Privacy Policy of JBV Investment Capital Limited Partner Portal</h1>
          <p className="text-sm text-slate-500">Effective Date: {EFFECTIVE_DATE}</p>
        </header>

        <div className="mt-10 space-y-6 text-sm leading-6 text-slate-700">
          <p>
            This Privacy Policy (the “Policy”) is promulgated by JBV Investment Capital, together with its affiliates
            (collectively, “JBV,” “we,” “our,” or “us”), for the purpose of establishing the principles under which
            information concerning Limited Partners (“LPs,” “you,” or “your”) is collected, processed, retained, and
            disclosed in connection with the use of the JBV Limited Partner Portal (the “Portal”). By accessing the Portal,
            you acknowledge and consent to the terms of this Policy, as may be amended from time to time.
          </p>
          <p>
            JBV collects information that is necessary or appropriate for the administration of your investment in one or
            more funds sponsored or advised by JBV. Such information may include personal data, such as name, contact
            details, government-issued identifiers, and documentation required for anti-money laundering and
            know-your-customer purposes; financial and transactional data, including capital commitments, contributions,
            distributions, banking details, and tax documents; technical data derived from your use of the Portal, such as
            login activity, internet protocol addresses, device identifiers, and security logs; and records of
            communications between you and JBV personnel.
          </p>
          <p>
            The information so collected is processed for purposes including the administration of your investment
            relationship; compliance with contractual, legal, regulatory, and tax obligations; the authentication and
            maintenance of secure access to the Portal; the preparation and dissemination of reports, notices, and
            statements; and the maintenance and improvement of Portal security and functionality.
          </p>
          <p>
            JBV may disclose information to third parties strictly to the extent necessary to facilitate the foregoing
            purposes. Such parties may include fund administrators, custodians, auditors, technology and cybersecurity
            service providers, legal and financial advisors, and, where required, governmental and regulatory authorities.
            JBV does not sell, lease, or otherwise commercially exploit personal data for unrelated purposes.
          </p>
          <p>
            JBV employs commercially reasonable and industry-standard physical, electronic, and administrative safeguards
            intended to preserve the confidentiality, integrity, and security of information maintained within the Portal.
            Notwithstanding the adoption of such safeguards, no system of electronic transmission or storage can be
            guaranteed to be wholly secure, and JBV makes no representation or warranty with respect to the absolute
            security of information transmitted or stored through the Portal.
          </p>
          <p>
            Information shall be retained only so long as necessary to achieve the purposes set forth herein, including
            compliance with applicable contractual, regulatory, and record-keeping obligations, following which such
            information shall be securely deleted or anonymized in accordance with JBV’s internal retention policies.
          </p>
          <p>
            Depending on your jurisdiction, you may have certain rights under applicable data protection laws, including
            rights of access, rectification, erasure, restriction, and objection. The exercise of such rights may be
            subject to limitations imposed by legal, regulatory, or contractual requirements. All requests in respect of
            such rights must be directed in writing to the JBV Compliance Department at the contact details provided below.
          </p>
          <p>
            Because JBV conducts business on a global basis, your information may be transferred across national borders.
            Where such transfers occur, JBV will implement appropriate safeguards, including contractual undertakings or
            regulatory authorizations, to ensure adequate protection of your information.
          </p>
          <p>
            JBV reserves the right to amend this Policy at its discretion. Amendments shall become effective upon their
            posting to the Portal, together with an updated effective date. Your continued use of the Portal following
            such posting shall constitute your acceptance of the Policy as amended.
          </p>
          <p>Questions concerning this Policy should be directed to:</p>
          <address className="not-italic text-sm text-slate-700">
            <div>JBV Investment Capital – Compliance Department</div>
            <div>405 Lexington Avenue, 32nd Floor</div>
            <div>New York, NY 10174</div>
            <div>
              Email: {" "}
              <a className="font-semibold text-blue-600 hover:underline" href="mailto:compliance@jbvcapital.com">
                compliance@jbvcapital.com
              </a>
            </div>
          </address>
          <p className="text-xs text-slate-500">
            For additional information about your use of the Portal, please review the {" "}
            <Link className="font-semibold text-blue-600 hover:underline" href="/terms-of-use">
              Terms of Use
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
