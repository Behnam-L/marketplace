import type {
  AdminStatus,
  AllocationStatus,
  ApiKeyStatus,
  BankTransactionStatus,
  BankTransactionType,
  ConnectionStatus,
  ConsumerStatus,
  CounterpartyType,
  Direction,
  DispatchStatus,
  DocumentKind,
  DocumentStatus,
  EnabledStatus,
  ExportResource,
  ExportStatus,
  IdentityLinkageStatus,
  InquiryKey,
  InvoiceStatus,
  ManualDocumentReason,
  MaturityRule,
  MerchantEntityType,
  MessageStatus,
  MessageTemplateStatus,
  OrderFailureReason,
  OrderStatus,
  OtpSessionStatus,
  PlanStatus,
  ProviderAdapterType,
  ProviderTransactionStatus,
  ProviderTransactionType,
  ReconciliationItemType,
  ReconciliationSeverity,
  ReconciliationStatus,
  RefundInitiator,
  RefundLegStatus,
  RefundLegType,
  RefundStatus,
  RefundStatusOnOrder,
  ReservationStatus,
  ResolutionType,
  WebhookEventStatus,
} from '../enums';
import type { Permission } from '../permissions';
import type { SettingKey } from '../settings';
import type { IsoDate, IsoDateTime } from './common';

/* ───────────── Auth ───────────── */

export interface LoginRequest {
  phone: string;
  password: string;
}
export interface LoginResponse {
  mfaToken: string;
}
export interface MfaRequest {
  mfaToken: string;
  totp: string;
}
export interface AdminSessionInfo {
  idleExpiresAt: IsoDateTime;
  absoluteExpiresAt: IsoDateTime;
  csrfToken: string;
  stepUpValidUntil: IsoDateTime | null;
}
export interface MeResponse {
  admin: { id: string; firstName: string; lastName: string; phone: string; roleId: string; roleName: string };
  permissions: Permission[];
  session: AdminSessionInfo;
}
export interface AcceptInvitationRequest {
  token: string;
  password: string;
}
export interface AcceptInvitationResponse {
  totpProvisioningUri: string;
  totpSecret: string;
}
export interface ConfirmTotpRequest {
  token: string;
  totp: string;
}
export interface PasswordResetRequest {
  phone: string;
}
export interface PasswordResetConfirmRequest {
  token: string;
  newPassword: string;
  totp: string;
}
export interface StepUpRequest {
  totp: string;
}

/* ───────────── Files ───────────── */

export interface UploadFileResponse {
  fileId: string;
}

/* ───────────── Settlement plans ───────────── */

export interface ProviderPlanDto {
  id: string;
  planNumber: string;
  providerPayableMarginBps: number;
  installmentCount: number;
  maturityRule: MaturityRule;
  status: PlanStatus;
  inUse: boolean;
  version: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
export interface ProviderPlanInput {
  providerPayableMarginBps: number;
  installmentCount: number;
  maturityRule: MaturityRule;
}
export interface MerchantPlanDto {
  id: string;
  planNumber: string;
  merchantReceivableMarginBps: number;
  cashSettlementEnabled: boolean;
  cashSettlementBps: number | null;
  installmentCount: number;
  maturityRule: MaturityRule;
  status: PlanStatus;
  inUse: boolean;
  version: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
export interface MerchantPlanInput {
  merchantReceivableMarginBps: number;
  cashSettlementEnabled: boolean;
  cashSettlementBps: number | null;
  installmentCount: number;
  maturityRule: MaturityRule;
}

/* ───────────── Providers ───────────── */

export interface InvoiceSummary {
  direction: Direction;
  openCount: number;
  openAmount: number;
  overdueCount: number;
  paidCount: number;
  recent: InvoiceListItem[];
}

export interface ProviderListItem {
  id: string;
  displayName: string;
  iconUrl: string | null;
  displayStatus: EnabledStatus;
  connectionStatus: ConnectionStatus;
  sortOrder: number;
  createdAt: IsoDateTime;
}
export interface ProviderInput {
  legalName: string;
  displayName: string;
  iconFileId: string | null;
  nationalId: string;
  economicId: string;
  websiteUrl: string;
  contactNumber: string;
  officeAddress: string;
  iban: string;
  contractFileId: string | null;
  providerSettlementPlanId: string;
  displayStatus: EnabledStatus;
  adapterType: ProviderAdapterType;
  apiBaseUrl: string;
  credentialsRef: string;
  inquiryKey: InquiryKey;
  sortOrder: number;
}
export interface ProviderDetail extends ProviderInput {
  id: string;
  iconUrl: string | null;
  contractUrl: string | null;
  connectionStatus: ConnectionStatus;
  connectionStatusChangedAt: IsoDateTime | null;
  planNumber: string | null;
  version: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  invoiceSummaries: InvoiceSummary[];
}

/* ───────────── Merchants ───────────── */

export interface MerchantListItem {
  id: string;
  displayName: string;
  entityType: MerchantEntityType;
  managerName: string;
  contactNumber: string;
  nationalId: string;
  status: EnabledStatus;
  createdAt: IsoDateTime;
}
export interface MerchantInput {
  displayName: string;
  entityType: MerchantEntityType;
  legalName: string;
  nationalId: string;
  economicId: string | null;
  managerName: string;
  managerNationalCode: string;
  contactNumber: string;
  websiteUrl: string;
  officeAddress: string;
  iban: string;
  contractFileId: string | null;
  merchantSettlementPlanId: string;
  status: EnabledStatus;
  returnUrlDomains: string[];
  webhookUrl: string | null;
}
export interface MerchantApiKeyDto {
  keyId: string;
  status: ApiKeyStatus;
  lastUsedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
}
export interface MerchantWebhookEventDto {
  id: string;
  eventType: string;
  status: WebhookEventStatus;
  attempts: number;
  nextAttemptAt: IsoDateTime | null;
  lastHttpStatus: number | null;
  createdAt: IsoDateTime;
}
export interface MerchantDetail extends MerchantInput {
  id: string;
  contractUrl: string | null;
  planNumber: string | null;
  version: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  apiKeys: MerchantApiKeyDto[];
  invoiceSummaries: InvoiceSummary[];
  recentWebhookEvents: MerchantWebhookEventDto[];
}
export interface CreateApiKeyResponse {
  keyId: string;
  secret: string;
}

/* ───────────── Consumers ───────────── */

export interface ConsumerListItem {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string;
  status: ConsumerStatus;
  cooldownUntil: IsoDateTime | null;
  createdAt: IsoDateTime;
}
export interface ConsumerLinkageDto {
  id: string;
  status: IdentityLinkageStatus;
  nationalId: string;
  dateOfBirth: IsoDate | null;
  verifiedAt: IsoDateTime | null;
  lastMatchedAt: IsoDateTime | null;
}
export interface ConsumerDetail extends ConsumerListItem {
  lastTransactionAt: IsoDateTime | null;
  linkage: ConsumerLinkageDto | null;
  linkedProviders: { providerId: string; displayName: string; lastUsedAt: IsoDateTime }[];
  orders: OrderListItem[];
  piiVisible: boolean;
}
export interface SetConsumerStatusRequest {
  status: 'Active' | 'Blocked';
  reason: string;
}

/* ───────────── Orders ───────────── */

export interface OrderListItem {
  id: string;
  merchantOrderNumber: string;
  merchantId: string;
  merchantName: string;
  totalAmount: number;
  cashAmount: number | null;
  creditAmount: number | null;
  providerCount: number;
  status: OrderStatus;
  failureReason: OrderFailureReason | null;
  allocationStatus: AllocationStatus | null;
  refundStatus: RefundStatusOnOrder;
  createdAt: IsoDateTime;
}
export interface OrderEventDto {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actor: string;
  reason: string | null;
  createdAt: IsoDateTime;
}
export interface ReservationDto {
  id: string;
  providerId: string;
  providerName: string;
  attemptNo: number;
  amount: number;
  status: ReservationStatus;
  providerReference: string | null;
  reservedAt: IsoDateTime | null;
  allocatedAt: IsoDateTime | null;
  releasedAt: IsoDateTime | null;
  reversedAmount: number;
}
export interface BankTransactionListItem {
  id: string;
  orderId: string | null;
  type: BankTransactionType;
  gatewayCode: string;
  amount: number;
  status: BankTransactionStatus;
  gatewayReference: string | null;
  cardMask: string | null;
  isAuthoritative: boolean;
  createdAt: IsoDateTime;
}
export interface BankTransactionDetail extends BankTransactionListItem {
  refundLegId: string | null;
  authorizedAt: IsoDateTime | null;
  verifiedAt: IsoDateTime | null;
  failureCode: string | null;
  attempts: number;
  technicalLog: { at: IsoDateTime; operation: string; outcome: string; detail: string | null }[];
}
export interface ProviderTransactionListItem {
  id: string;
  orderId: string | null;
  reservationId: string | null;
  refundLegId: string | null;
  providerId: string;
  providerName: string;
  type: ProviderTransactionType;
  amount: number;
  status: ProviderTransactionStatus;
  providerReference: string | null;
  attempts: number;
  nextAttemptAt: IsoDateTime | null;
  lastError: string | null;
  createdAt: IsoDateTime;
}
export interface OrderDetail extends OrderListItem {
  consumer: { id: string; phone: string; firstName: string | null; lastName: string | null } | null;
  cashPaymentBps: number | null;
  refundedAmount: number;
  sessionExpiresAt: IsoDateTime;
  paymentDeadlineAt: IsoDateTime | null;
  completedAt: IsoDateTime | null;
  inquiryAttempts: number;
  reservationAttempts: number;
  returnUrl: string;
  callbackUrl: string | null;
  termsVersion: string | null;
  termsAcceptedAt: IsoDateTime | null;
  settlementTermsSnapshot: unknown;
  version: number;
  reservations: ReservationDto[];
  bankTransactions: BankTransactionListItem[];
  providerTransactions: ProviderTransactionListItem[];
  documents: DocumentListItem[];
  refunds: RefundListItem[];
  events: OrderEventDto[];
}

/* ───────────── Refunds ───────────── */

export interface RefundListItem {
  id: string;
  orderId: string;
  amount: number;
  merchantMarginRefund: number;
  status: RefundStatus;
  initiatedBy: RefundInitiator;
  actorId: string | null;
  reason: string;
  createdAt: IsoDateTime;
}
export interface RefundLegDto {
  id: string;
  legType: RefundLegType;
  providerId: string | null;
  providerName: string | null;
  amount: number;
  providerMarginRefund: number;
  status: RefundLegStatus;
  needsPayeeIban: boolean;
  payeeIbanMasked: string | null;
  documentId: string | null;
}
export interface RefundDetail extends RefundListItem {
  legs: RefundLegDto[];
}
export interface AdminCreateRefundRequest {
  amount: number;
  reason: string;
}
export interface SetPayeeIbanRequest {
  iban: string;
}

/* ───────────── Documents & invoices ───────────── */

export interface DocumentListItem {
  id: string;
  number: string;
  direction: Direction;
  counterpartyType: CounterpartyType;
  counterpartyId: string;
  counterpartyName: string;
  orderId: string | null;
  refundId: string | null;
  kind: DocumentKind;
  installmentIndex: number;
  installmentCount: number;
  amount: number;
  maturityDate: IsoDate;
  status: DocumentStatus;
  invoiceId: string | null;
  createdAt: IsoDateTime;
}
export interface DocumentDetail extends DocumentListItem {
  reason: ManualDocumentReason | null;
  note: string | null;
  createdBy: string;
  approvedBy: string | null;
  cancelReason: string | null;
  sourceKey: string;
  isManual: boolean;
}
export interface CreateManualDocumentRequest {
  direction: Direction;
  counterpartyType: CounterpartyType;
  counterpartyId: string;
  amount: number;
  maturityDate: IsoDate;
  orderId?: string | null;
  reason: ManualDocumentReason;
  note: string;
}
export interface DocumentActionRequest {
  note: string;
}
export interface InvoiceListItem {
  id: string;
  number: string;
  direction: Direction;
  counterpartyType: CounterpartyType;
  counterpartyId: string;
  counterpartyName: string;
  invoiceDate: IsoDate;
  periodFrom: IsoDate;
  periodTo: IsoDate;
  totalAmount: number;
  documentCount: number;
  dueDate: IsoDate;
  status: InvoiceStatus;
}
export interface InvoiceDetail extends InvoiceListItem {
  paidAt: IsoDateTime | null;
  bankReference: string | null;
  recordedBy: string | null;
  documents: DocumentListItem[];
}
export interface RecordInvoicePaymentRequest {
  amount: number;
  paidAt: IsoDateTime;
  bankReference: string;
}

/* ───────────── Settings ───────────── */

export interface SettingDto {
  key: SettingKey;
  value: number | boolean;
  default: number | boolean;
  type: 'int' | 'bool';
  min: number | null;
  max: number | null;
  description: string;
  updatedAt: IsoDateTime | null;
  updatedBy: string | null;
}
export interface UpdateSettingRequest {
  value: number | boolean;
  reason: string;
}
export interface SettingChangeDto {
  id: string;
  key: SettingKey;
  oldValue: number | boolean;
  newValue: number | boolean;
  reason: string;
  changedBy: string;
  createdAt: IsoDateTime;
}

/* ───────────── Admins & roles ───────────── */

export interface AdminListItem {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  roleId: string;
  roleName: string;
  status: AdminStatus;
  lastLoginAt: IsoDateTime | null;
  lockedUntil: IsoDateTime | null;
  createdAt: IsoDateTime;
}
export interface CreateAdminRequest {
  firstName: string;
  lastName: string;
  phone: string;
  roleId: string;
}
export interface UpdateAdminRequest {
  firstName?: string;
  lastName?: string;
  roleId?: string;
  status?: 'Active' | 'Inactive';
}
export interface CreateAdminResponse extends AdminListItem {
  invitationDelivered: boolean;
}
export interface RoleDto {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissionCodes: Permission[];
  adminCount: number;
}
export interface RoleInput {
  name: string;
  description: string;
}
export interface SetRolePermissionsRequest {
  permissionCodes: Permission[];
}
export interface PermissionDto {
  code: Permission;
  description: string;
}

/* ───────────── Reconciliation ───────────── */

export interface ReconciliationItemDto {
  id: string;
  type: ReconciliationItemType;
  severity: ReconciliationSeverity;
  orderId: string | null;
  refs: Record<string, string>;
  expectedAmount: number | null;
  actualAmount: number | null;
  status: ReconciliationStatus;
  assigneeId: string | null;
  resolutionType: ResolutionType | null;
  note: string | null;
  linkedDocumentId: string | null;
  createdAt: IsoDateTime;
  resolvedAt: IsoDateTime | null;
}
export interface UpdateReconciliationItemRequest {
  status?: 'InReview' | 'Resolved';
  assigneeId?: string | null;
  resolutionType?: ResolutionType;
  note?: string;
  linkedDocumentId?: string | null;
}
export interface PspReportImportResponse {
  imported: number;
  matched: number;
  itemsCreated: number;
}

/* ───────────── Messages ───────────── */

export interface MessageTemplateDto {
  id: string;
  event: string;
  channel: 'SMS';
  name: string;
  content: string;
  params: string[];
  status: MessageTemplateStatus;
  orphaned: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
export interface MessageTemplateInput {
  event: string;
  channel: 'SMS';
  name: string;
  content: string;
  status: MessageTemplateStatus;
}
export interface MessageEventDto {
  event: string;
  requiredParams: string[];
  description: string;
}
export interface MessageLogDto {
  id: string;
  templateId: string | null;
  event: string;
  recipient: string;
  status: MessageStatus;
  provider: string | null;
  providerMessageId: string | null;
  sentAt: IsoDateTime | null;
  deliveredAt: IsoDateTime | null;
  error: string | null;
  createdAt: IsoDateTime;
}

/* ───────────── Audit & exports ───────────── */

export interface AuditLogDto {
  id: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: IsoDateTime;
}
export interface CreateExportRequest {
  resource: ExportResource;
  filters: Record<string, string>;
}
export interface ExportDto {
  id: string;
  resource: ExportResource;
  status: ExportStatus;
  rowCount: number | null;
  downloadUrl: string | null;
  error: string | null;
  createdAt: IsoDateTime;
}

/* ───────────── Misc views ───────────── */

export interface OtpSessionDto {
  id: string;
  status: OtpSessionStatus;
  dispatchStatus: DispatchStatus;
  attempts: number;
  expiresAt: IsoDateTime;
}
