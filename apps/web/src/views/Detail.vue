<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { api, currentUser, type Application, type ApprovalAction, type FileItem } from '../api';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const app = ref<Application>();
const category = ref('ALL');
const fileKeyword = ref('');
const user = computed(() => currentUser());
const previewDialog = ref(false);
const previewFile = ref<FileItem>();
const previewUrl = ref('');
const previewLoading = ref(false);
const thumbnailUrls = ref<Record<number, string>>({});
const canApprove = computed(() => app.value?.tasks?.some((task) => task.approverId === user.value?.id && task.status === 'PENDING'));
const canPreview = (mime: string) => mime.startsWith('image/') || mime === 'application/pdf';

const categoryKeys: Record<string, string> = {
  CHAT_RECORD: 'files.chat',
  VOUCHER: 'files.voucher',
  CONTRACT: 'files.contract',
  OTHER: 'files.other',
};

const currentTask = computed(() => app.value?.tasks?.find((task) => task.status === 'PENDING'));
const submittedAction = computed(() => [...(app.value?.actions || [])].reverse().find((item) => ['SUBMITTED', 'RESUBMITTED'].includes(item.action)));
const filteredFiles = computed(() => {
  const keyword = fileKeyword.value.trim().toLowerCase();
  return (app.value?.files || []).filter((file) => {
    const categoryMatched = category.value === 'ALL' || file.category === category.value;
    const keywordMatched =
      !keyword ||
      displayFileName(file.originalName).toLowerCase().includes(keyword) ||
      file.mimeType.toLowerCase().includes(keyword) ||
      fileCategoryLabel(file.category).toLowerCase().includes(keyword);
    return categoryMatched && keywordMatched;
  });
});
function timelineColor(item: ApprovalAction) {
  if (item.action === 'APPROVED') return '#22c55e';
  if (item.action === 'REJECTED') return '#ef4444';
  if (item.action === 'WITHDRAWN') return '#9ca3af';
  return '#9ca3af';
}

function actionTone(item: ApprovalAction) {
  if (item.action === 'APPROVED') return 'success';
  if (item.action === 'REJECTED') return 'danger';
  return 'normal';
}

function displayFileName(name: string) {
  try {
    const decoded = decodeURIComponent(escape(name));
    return decoded.includes('�') ? name : decoded;
  } catch {
    return name;
  }
}

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleString() : '-';
}

function actionLabel(item: ApprovalAction) {
  if (item.comment?.startsWith('流程转接：')) return t('detail.transfer');
  return t(`actions.${item.action}`);
}

function oldActionLine(item: ApprovalAction) {
  const node = item.node ? t(`nodes.${item.node}`) : t('fields.applicant');
  return `${node} · ${actionLabel(item)}`;
}

function oldPendingTimelineLine() {
  const task = currentTask.value;
  if (!task) return '';
  return `${t(`nodes.${task.node}`)} · ${t('detail.inProgress')}`;
}

function actionNodeName(item: ApprovalAction) {
  return item.node ? t(`nodes.${item.node}`) : t('fields.applicant');
}

function actionTitle(item: ApprovalAction) {
  if (item.action === 'CREATED') return t('timelineTitles.CREATED');
  if (item.action === 'SUBMITTED' || item.action === 'RESUBMITTED') return t('timelineTitles.SUBMITTED');
  if (item.action === 'APPROVED' && item.node) return t('timelineTitles.NODE_APPROVED', { node: actionNodeName(item) });
  if (item.action === 'REJECTED' && item.node) return t('timelineTitles.NODE_REJECTED', { node: actionNodeName(item) });
  if (item.action === 'WITHDRAWN') return t('timelineTitles.WITHDRAWN');
  return actionLabel(item);
}

function actionDescription(item: ApprovalAction) {
  const node = actionNodeName(item);
  if (item.action === 'CREATED') return t('timelineDescriptions.CREATED', { name: item.actor.name });
  if (item.action === 'SUBMITTED' || item.action === 'RESUBMITTED') return t('timelineDescriptions.SUBMITTED', { name: item.actor.name });
  if (item.action === 'APPROVED') return t('timelineDescriptions.APPROVED', { name: item.actor.name, node });
  if (item.action === 'REJECTED') return t('timelineDescriptions.REJECTED', { name: item.actor.name, node });
  if (item.action === 'WITHDRAWN') return t('timelineDescriptions.WITHDRAWN', { name: item.actor.name });
  return `${item.actor.name} ${actionLabel(item)}`;
}

function pendingTimelineTitle() {
  const task = currentTask.value;
  if (!task) return '';
  return t('timelineTitles.NODE_PENDING', { node: t(`nodes.${task.node}`) });
}

function actionComment(item: ApprovalAction) {
  if (!item.comment) return '';
  if (item.action === 'APPROVED') return t('detail.approvalRemarkPrefix', { comment: item.comment });
  if (item.action === 'REJECTED') return t('detail.rejectReasonPrefix', { comment: item.comment });
  if (item.comment === '没有可用主管，已直接进入财务审批') return t('systemComments.noManagerToFinance');
  if (item.comment === '没有可用主管，已直接进入财务审批') return t('systemComments.noManagerToFinance');
  if (item.comment === '重新提交为草稿') return t('systemComments.reopenedDraft');
  return item.comment;
}

function fileCategoryLabel(categoryValue: string) {
  const key = categoryKeys[categoryValue];
  return key ? t(key) : categoryValue;
}

function fileKind(file: FileItem) {
  if (file.mimeType.startsWith('image/')) return t('files.image');
  if (file.mimeType === 'application/pdf') return t('files.pdf');
  return t('files.document');
}

function revokeUrl(url: string) {
  if (url) URL.revokeObjectURL(url);
}

async function fileBlobUrl(file: FileItem) {
  const response = await api.get(`/applications/files/${file.id}`, { responseType: 'blob' });
  return URL.createObjectURL(new Blob([response.data], { type: file.mimeType }));
}

async function loadThumbnails() {
  Object.values(thumbnailUrls.value).forEach(revokeUrl);
  thumbnailUrls.value = {};
  const imageFiles = (app.value?.files || []).filter((file) => file.mimeType.startsWith('image/')).slice(0, 12);
  const entries = await Promise.all(
    imageFiles.map(async (file) => {
      try {
        return [file.id, await fileBlobUrl(file)] as const;
      } catch {
        return undefined;
      }
    }),
  );
  thumbnailUrls.value = Object.fromEntries(entries.filter(Boolean) as Array<readonly [number, string]>);
}

async function load() {
  app.value = (await api.get(`/applications/${route.params.id}`)).data;
  await loadThumbnails();
}

async function approve() {
  const { value } = await ElMessageBox.prompt(t('detail.approveComment'), t('detail.approveTitle'));
  await api.post(`/applications/${app.value!.id}/approve`, { comment: value || '' });
  await load();
}

async function reject() {
  const { value } = await ElMessageBox.prompt(t('detail.rejectReason'), t('detail.rejectTitle'), {
    inputValidator: (value) => !!value || t('detail.rejectRequired'),
  });
  await api.post(`/applications/${app.value!.id}/reject`, { comment: value });
  await load();
}

async function openFile(file: FileItem) {
  if (!canPreview(file.mimeType)) {
    await downloadFile(file);
    return;
  }
  previewLoading.value = true;
  previewFile.value = file;
  previewDialog.value = true;
  revokeUrl(previewUrl.value);
  previewUrl.value = '';
  try {
    previewUrl.value = await fileBlobUrl(file);
  } catch {
    ElMessage.error(t('files.noPreview'));
  } finally {
    previewLoading.value = false;
  }
}

async function downloadFile(file: FileItem) {
  const url = await fileBlobUrl(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = displayFileName(file.originalName);
  link.click();
  setTimeout(() => revokeUrl(url), 1000);
}

function goBack() {
  router.push({ path: '/applications', query: route.query });
}

watch([category, fileKeyword], () => undefined);
onMounted(load);
onBeforeUnmount(() => {
  revokeUrl(previewUrl.value);
  Object.values(thumbnailUrls.value).forEach(revokeUrl);
});
</script>

<template>
  <div v-if="app" class="detail-page">
    <div class="nav-row">
      <el-breadcrumb separator="/">
        <el-breadcrumb-item :to="{ path: '/applications' }">{{ t('mine') }}</el-breadcrumb-item>
        <el-breadcrumb-item>{{ t('detail.title') }}</el-breadcrumb-item>
        <el-breadcrumb-item>#{{ app.id }}</el-breadcrumb-item>
      </el-breadcrumb>
      <el-button @click="goBack">{{ t('common.back') }}</el-button>
    </div>

    <section class="summary-panel">
      <div class="summary-title">
        <span class="muted">#{{ app.id }}</span>
        <h2>{{ app.influencerName || t('detail.unnamedInfluencer') }}</h2>
      </div>
      <div class="summary-grid">
        <div class="summary-item">
          <span>{{ t('fields.applicant') }}</span>
          <strong>{{ app.applicant.name }}</strong>
        </div>
        <div class="summary-item amount-item">
          <span>{{ t('fields.amount') }}</span>
          <strong>{{ app.amount || '-' }} {{ app.currency || '' }}</strong>
        </div>
        <div class="summary-item">
          <span>{{ t('common.status') }}</span>
          <strong :class="['status-text', `status-${app.status}`]">{{ t(`statuses.${app.status}`) }}</strong>
        </div>
        <div class="summary-item">
          <span>{{ t('common.currentNode') }}</span>
          <strong>{{ currentTask ? t(`nodes.${currentTask.node}_APPROVAL`) : t('detail.noCurrentNode') }}</strong>
        </div>
        <div class="summary-item">
          <span>{{ t('common.submittedAt') }}</span>
          <strong>{{ formatDate(submittedAction?.createdAt || app.createdAt) }}</strong>
        </div>
      </div>
      <div class="approval-actions">
        <el-button v-if="canApprove" type="success" @click="approve">{{ t('common.approve') }}</el-button>
        <el-button v-if="canApprove" type="danger" @click="reject">{{ t('common.reject') }}</el-button>
      </div>
    </section>

    <div class="detail-workspace">
      <section class="info-panel">
        <div class="section-heading">
          <h3>{{ t('detail.applicationInfo') }}</h3>
        </div>
        <dl class="info-list">
          <div><dt>{{ t('fields.contact') }}</dt><dd>{{ app.contact || '-' }}</dd></div>
          <div><dt>{{ t('fields.paymentMethod') }}</dt><dd>{{ app.paymentMethod || '-' }}</dd></div>
          <div><dt>{{ t('fields.homepage') }}</dt><dd><a v-if="app.homepage" :href="app.homepage" target="_blank">{{ app.homepage }}</a><span v-else>-</span></dd></div>
          <div><dt>{{ t('fields.createdAt') }}</dt><dd>{{ formatDate(app.createdAt) }}</dd></div>
          <div class="full-row"><dt>{{ t('fields.remark') }}</dt><dd>{{ app.remark || '-' }}</dd></div>
        </dl>

        <div class="section-heading timeline-heading">
          <h3>{{ t('detail.timeline') }}</h3>
        </div>
        <el-timeline class="approval-timeline">
          <el-timeline-item
            v-for="item in app.actions"
            :key="item.id"
            :color="timelineColor(item)"
            placement="top"
          >
            <div :class="['timeline-card', `action-${item.action}`]">
              <div class="timeline-header">
                <strong :class="['timeline-title', `action-title-${actionTone(item)}`]">{{ actionTitle(item) }}</strong>
              </div>
              <p class="timeline-time">{{ formatDate(item.createdAt) }}</p>
              <p class="timeline-desc">{{ actionDescription(item) }}</p>
              <p v-if="actionComment(item)" class="timeline-note">{{ actionComment(item) }}</p>
            </div>
          </el-timeline-item>
          <el-timeline-item v-if="currentTask" color="#f59e0b" placement="top">
            <div class="timeline-card action-PENDING">
              <div class="timeline-header">
                <strong class="timeline-title action-title-progress">{{ pendingTimelineTitle() }}</strong>
              </div>
              <p class="timeline-time">{{ formatDate(currentTask.createdAt) }}</p>
              <p class="timeline-desc">{{ currentTask.approver?.name || '-' }}</p>
            </div>
          </el-timeline-item>
        </el-timeline>
      </section>

      <aside class="attachments-panel">
        <div class="section-heading">
          <h3>{{ t('detail.quickReview') }}</h3>
          <span>{{ filteredFiles.length }} {{ t('common.attachments') }}</span>
        </div>
        <div class="file-tools">
          <el-select v-model="category" class="category-select">
            <el-option :label="t('common.all')" value="ALL" />
            <el-option :label="t('files.chat')" value="CHAT_RECORD" />
            <el-option :label="t('files.voucher')" value="VOUCHER" />
            <el-option :label="t('files.contract')" value="CONTRACT" />
            <el-option :label="t('files.other')" value="OTHER" />
          </el-select>
          <el-input v-model="fileKeyword" clearable class="file-search" :placeholder="t('placeholders.searchFiles')" />
        </div>

        <div v-if="!filteredFiles.length" class="empty-files">{{ t('files.empty') }}</div>
        <div v-else class="file-gallery">
          <button v-for="file in filteredFiles" :key="file.id" class="file-card" type="button" @click="openFile(file)">
            <span class="file-thumb">
              <img v-if="thumbnailUrls[file.id]" :src="thumbnailUrls[file.id]" alt="" />
              <span v-else>{{ fileKind(file) }}</span>
            </span>
            <span class="file-meta">
              <strong>{{ displayFileName(file.originalName) }}</strong>
              <small>{{ fileCategoryLabel(file.category) }} · {{ file.mimeType }}</small>
            </span>
          </button>
        </div>
      </aside>
    </div>

    <el-dialog v-model="previewDialog" :title="previewFile ? displayFileName(previewFile.originalName) : t('files.preview')" width="82vw" class="preview-dialog" destroy-on-close>
      <div v-loading="previewLoading" class="preview-body">
        <img v-if="previewFile?.mimeType.startsWith('image/') && previewUrl" :src="previewUrl" alt="" />
        <iframe v-else-if="previewFile?.mimeType === 'application/pdf' && previewUrl" :src="previewUrl" />
        <p v-else>{{ t('files.noPreview') }}</p>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.detail-page {
  display: grid;
  gap: 16px;
  min-width: 0;
}
.nav-row,
.section-heading,
.file-tools,
.timeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-width: 0;
}
.nav-row {
  min-height: 32px;
}
.nav-row :deep(.el-breadcrumb) {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}
.nav-row > .el-button {
  width: 88px;
  min-width: 88px;
}
.summary-panel,
.info-panel,
.attachments-panel {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-panel);
  background: var(--surface-panel);
  box-shadow: var(--shadow-panel);
}
.summary-panel {
  display: grid;
  grid-template-columns: minmax(260px, 1.1fr) minmax(640px, 3fr) auto;
  align-items: center;
  gap: 14px;
  min-height: 96px;
  padding: 14px 16px;
}
.summary-title {
  min-width: 0;
}
.summary-title h2 {
  margin: 2px 0 0;
  font-size: 22px;
  font-weight: 600;
  line-height: 28px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}
.summary-item {
  min-width: 0;
}
.summary-item span {
  display: block;
  color: var(--text-subtle);
  font-size: 12px;
  line-height: 18px;
}
.summary-item strong {
  display: block;
  min-height: 22px;
  line-height: 22px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.amount-item strong {
  color: var(--text-strong);
  font-size: 18px;
}
.approval-actions {
  display: inline-flex;
  gap: 8px;
}
.approval-actions :deep(.el-button) {
  width: 92px;
  min-width: 92px;
}
.status-text {
  min-height: 22px;
  font-weight: 700;
}
.status-DRAFT,
.status-WITHDRAWN {
  color: var(--status-muted);
}
.status-PENDING_MANAGER,
.status-PENDING_FINANCE {
  color: var(--status-progress);
}
.status-APPROVED {
  color: var(--status-success);
}
.status-MANAGER_REJECTED {
  color: var(--status-danger);
}
.status-FINANCE_REJECTED {
  color: var(--status-danger);
}
.info-panel,
.attachments-panel {
  padding: 18px;
}
.section-heading h3 {
  margin: 0;
  min-height: 26px;
  color: var(--text-strong);
  font-size: 18px;
  font-weight: 700;
}
.section-heading span {
  color: var(--text-subtle);
  font-size: 13px;
  white-space: nowrap;
}
.detail-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(340px, 420px);
  gap: 16px;
  align-items: start;
}
.info-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 14px 0 0;
}
.info-list div {
  min-width: 0;
  padding: 13px 14px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface-soft);
}
.info-list .full-row {
  grid-column: 1 / -1;
}
.info-list dt {
  color: var(--text-subtle);
  font-size: 12px;
  font-weight: 600;
}
.info-list dd {
  margin: 4px 0 0;
  min-height: 22px;
  overflow-wrap: anywhere;
}
.timeline-heading {
  margin-top: 24px;
}
.approval-timeline {
  margin-top: 12px;
  padding-left: 4px;
}
:deep(.approval-timeline .el-timeline-item__wrapper) {
  top: -12px;
}
:deep(.approval-timeline .el-timeline-item__timestamp) {
  display: none;
}
.timeline-card {
  padding: 12px 14px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: #fff;
}
.action-APPROVED {
  background: #fff;
}
.action-REJECTED {
  background: #fff;
}
.action-SUBMITTED,
.action-RESUBMITTED,
.action-PENDING {
  background: #fff;
}
.timeline-title,
.timeline-time,
.timeline-desc {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.timeline-title {
  display: block;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  color: var(--text-strong);
}
.action-title-success {
  color: var(--status-success);
}
.action-title-danger {
  color: var(--status-danger);
}
.action-title-progress {
  color: var(--status-progress);
}
.action-title-normal {
  color: var(--status-muted);
}
.timeline-time {
  margin: 4px 0 0;
  color: var(--text-subtle);
  font-size: 12px;
  line-height: 18px;
}
.timeline-desc {
  margin: 10px 0 0;
  color: var(--text-normal);
  font-size: 13px;
  line-height: 1.6;
}
.timeline-note {
  margin: 8px 0 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--surface-soft);
  color: var(--text-normal);
  font-size: 13px;
  line-height: 1.6;
  white-space: normal;
}
.attachments-panel {
  position: sticky;
  top: 0;
}
.file-tools {
  margin-top: 12px;
}
.category-select {
  width: 168px;
  min-width: 168px;
}
.file-search {
  min-width: 0;
}
.file-gallery {
  display: grid;
  gap: 10px;
  margin-top: 12px;
  max-height: calc(100vh - 330px);
  overflow: auto;
  padding-right: 2px;
}
.file-card {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 10px;
  width: 100%;
  min-height: 84px;
  padding: 8px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface-panel);
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.file-card:hover,
.file-card:focus {
  border-color: var(--border-strong);
  box-shadow: 0 8px 24px rgba(17, 24, 39, 0.08);
}
.file-thumb {
  display: grid;
  place-items: center;
  width: 72px;
  height: 66px;
  overflow: hidden;
  border-radius: 6px;
  background: var(--surface-soft);
  color: var(--text-normal);
  font-size: 12px;
  font-weight: 700;
}
.file-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.file-meta {
  min-width: 0;
}
.file-meta strong,
.file-meta small {
  display: block;
  overflow-wrap: anywhere;
}
.file-meta small {
  margin-top: 6px;
  color: var(--text-subtle);
  line-height: 1.35;
}
.empty-files {
  display: grid;
  place-items: center;
  min-height: 160px;
  margin-top: 12px;
  border: 1px dashed var(--border-strong);
  border-radius: 8px;
  color: var(--status-muted);
}
.preview-body {
  display: grid;
  place-items: center;
  min-height: 68vh;
  background: #111827;
}
.preview-body img,
.preview-body iframe {
  width: 100%;
  height: 68vh;
  border: 0;
  object-fit: contain;
}
@media (max-width: 1180px) {
  .summary-panel,
  .detail-workspace {
    grid-template-columns: 1fr;
  }
  .attachments-panel {
    position: static;
  }
}
@media (max-width: 760px) {
  .summary-grid,
  .info-list {
    grid-template-columns: 1fr;
  }
  .summary-panel {
    padding: 14px;
  }
}
</style>
