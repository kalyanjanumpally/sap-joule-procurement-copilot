service AIService @(path: '/ai') {

  type POSummary {
    purchaseOrderId : String;
    summary         : String;
    tokensUsed      : Integer;
    model           : String;
  }

  type InvoiceRisk {
    invoiceId : String;
    risk      : String enum { low; medium; high };
    rationale : String;
    tokensUsed: Integer;
    model     : String;
  }

  action summarizePurchaseOrder(
    purchaseOrderId : String not null,
    poJson          : LargeString
  ) returns POSummary;

  action explainInvoiceRisk(
    invoiceId       : String not null,
    invoiceJson     : LargeString
  ) returns InvoiceRisk;
}
