{% if summary %}
📄 **PO `{{ purchaseOrderId }}`**

{{ summary }}
{% else %}
Could not summarize PO `{{ purchaseOrderId }}`: {{ error.message }}
{% endif %}
