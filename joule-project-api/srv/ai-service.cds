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

  type InvoiceLineItem {
    description : String;
    quantity    : Decimal;
    unitPrice   : Decimal;
    lineTotal   : Decimal;
  }

  type InvoiceExtract {
    vendor         : String;
    invoiceNumber  : String;
    invoiceDate    : String;
    dueDate        : String;
    currency       : String;
    subtotal       : Decimal;
    tax            : Decimal;
    total          : Decimal;
    lineItems      : many InvoiceLineItem;
    tokensUsed     : Integer;
    model          : String;
  }

  action summarizePurchaseOrder(
    purchaseOrderId : String not null,
    poJson          : LargeString
  ) returns POSummary;

  action explainInvoiceRisk(
    invoiceId       : String not null,
    invoiceJson     : LargeString
  ) returns InvoiceRisk;

  /**
   * Vision-powered structured extraction. Provide either a base64-encoded
   * image OR a public image URL. Returns structured line items + totals.
   *
   * Uses a vision model (default: llama-3.2-11b-vision-preview on Groq);
   * override via the `model` parameter to use gpt-4o, claude-opus-4-7, etc.
   */
  action extractInvoiceLineItems(
    imageBase64 : LargeString,
    imageUrl    : String,
    mediaType   : String,
    model       : String
  ) returns InvoiceExtract;
}
