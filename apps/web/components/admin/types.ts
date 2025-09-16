export type VisibilityRule = {
  id?: string;
  tableId: string;
  fieldId: string;
  normalizedFieldId?: string;
  visibleToLP: boolean;
  visibleToPartners: boolean;
  notes?: string;
};

