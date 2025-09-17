export type LpInvestmentRecord = {
  id: string;
  fields: Record<string, any>;
  _updatedTime: string | null;
};

export type LpMetrics = {
  commitmentTotal: number;
  navTotal: number;
  distributionsTotal: number;
  netMoicAvg: number;
};

export type LpProfile = {
  name: string;
  email: string;
};

export type LpDataResponse = {
  profile: LpProfile;
  records: LpInvestmentRecord[];
  metrics: LpMetrics;
  note?: "contact-not-found" | "view-filtered";
};

export type LpDocumentItem = {
  name: string;
  size?: number;
  type?: string;
  investmentId: string;
  investmentName?: string;
  periodEnding?: any;
  field: string;
  index: number;
};

export type LpDocumentsResponse = {
  documents: LpDocumentItem[];
  note?: "contact-not-found" | "view-filtered";
};
