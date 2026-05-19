<script setup lang="ts">
import { ElMessage, type UploadUserFile } from 'element-plus';
import { reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Application } from '../api';

type FileCategory = 'HOMEPAGE' | 'CHAT_RECORD' | 'VOUCHER' | 'CONTRACT' | 'OTHER';
export type PendingFiles = Record<FileCategory, UploadUserFile[]>;

const props = defineProps<{ model?: Partial<Application> }>();
const emit = defineEmits<{ save: [value: Record<string, string>, files: PendingFiles] }>();
const { t } = useI18n();

const currencies = ['USD', 'CNY', 'EUR', 'GBP', 'JPY', 'KRW', 'SGD', 'THB', 'VND', 'IDR', 'MYR', 'PHP'];
const amountPattern = /^\d+(\.\d+)?$/;
const form = reactive({
  influencerName: '',
  contact: '',
  amount: '',
  currency: '',
  paymentMethod: '',
  remark: '',
});
const files = reactive<PendingFiles>({
  HOMEPAGE: [],
  CHAT_RECORD: [],
  VOUCHER: [],
  CONTRACT: [],
  OTHER: [],
});

const uploadGroups = [
  { key: 'HOMEPAGE', labelKey: 'files.homepage', accept: 'image/jpeg,image/png', hintKey: 'files.imageOnly' },
  { key: 'OTHER', labelKey: 'files.materials', accept: 'image/jpeg,image/png,application/pdf,.doc,.docx,.xls,.xlsx', hintKey: 'files.materialsHint' },
] as const;

function resetFiles(model?: Partial<Application>) {
  Object.keys(files).forEach((key) => {
    files[key as FileCategory] = [];
  });
  for (const file of model?.files || []) {
    const category = file.category as FileCategory;
    if (!files[category]) continue;
    if (files[category].length) continue;
    files[category].push({
      name: file.originalName,
      uid: -file.id,
      status: 'success',
      url: `/api/applications/files/${file.id}`,
    });
  }
}

function normalizeAmount(value: string) {
  const cleaned = value.replace(/[^\d.]/g, '');
  const [integer = '', ...decimalParts] = cleaned.split('.');
  return decimalParts.length ? `${integer}.${decimalParts.join('')}` : integer;
}

function onAmountInput(value: string) {
  if (value && !/^\d*\.?\d*$/.test(value)) {
    ElMessage.warning(t('validation.amountNumber'));
  }
  form.amount = normalizeAmount(value);
}

function saveForm() {
  const missingField = ['influencerName', 'contact', 'amount', 'currency', 'paymentMethod'].find((key) => !String(form[key as keyof typeof form] || '').trim());
  if (missingField) {
    ElMessage.error(t('validation.applicationRequired'));
    return;
  }
  if (!amountPattern.test(form.amount)) {
    ElMessage.error(t('validation.amountNumber'));
    return;
  }
  const missingFileGroup = uploadGroups.find((group) => !files[group.key].length);
  if (missingFileGroup) {
    ElMessage.error(t('validation.fileRequired', { field: t(missingFileGroup.labelKey) }));
    return;
  }
  emit('save', form, files);
}

watch(
  () => props.model,
  (model) => {
    Object.assign(form, {
      influencerName: model?.influencerName || '',
      contact: model?.contact || '',
      amount: model?.amount ? String(model.amount) : '',
      currency: model?.currency || '',
      paymentMethod: model?.paymentMethod || '',
      remark: model?.remark || '',
    });
    resetFiles(model);
  },
  { immediate: true },
);
</script>

<template>
  <el-form label-position="top" class="grid">
    <el-form-item :label="t('fields.influencerName')" required>
      <el-input v-model="form.influencerName" />
    </el-form-item>
    <el-form-item :label="t('fields.contact')" required>
      <el-input v-model="form.contact" />
    </el-form-item>
    <el-form-item :label="t('fields.cooperationAmount')" required>
      <el-input
        v-model="form.amount"
        inputmode="decimal"
        :placeholder="t('placeholders.number')"
        @input="onAmountInput"
      />
    </el-form-item>
    <el-form-item :label="t('fields.currency')" required>
      <el-select v-model="form.currency" filterable clearable :placeholder="t('placeholders.currency')">
        <el-option v-for="currency in currencies" :key="currency" :label="currency" :value="currency" />
      </el-select>
    </el-form-item>
    <el-form-item :label="t('fields.paymentMethod')" required>
      <el-input v-model="form.paymentMethod" />
    </el-form-item>
    <el-form-item :label="t('fields.remark')" class="full">
      <el-input v-model="form.remark" type="textarea" :rows="4" />
    </el-form-item>

    <section class="full attachments">
      <h3>{{ t('files.title') }}</h3>
      <p class="muted">{{ t('files.note') }}</p>
      <div class="upload-grid">
        <el-form-item v-for="group in uploadGroups" :key="group.key" class="upload-form-item">
          <template #label>
            <span class="attachment-label">
              <span class="required-mark">*</span>
              {{ t(group.labelKey) }}
              <span class="attachment-hint">({{ t(group.hintKey) }})</span>
            </span>
          </template>
          <el-upload
            v-model:file-list="files[group.key]"
            :auto-upload="false"
            :accept="group.accept"
            :limit="1"
            class="file-upload"
          >
            <el-button>{{ t('files.choose') }}</el-button>
          </el-upload>
        </el-form-item>
      </div>
    </section>

    <el-form-item class="full">
      <el-button type="primary" @click="saveForm">{{ t('common.save') }}</el-button>
    </el-form-item>
  </el-form>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 20px;
  min-width: 0;
}
.grid :deep(.el-form-item) {
  min-width: 0;
  margin-bottom: 14px;
}
.grid :deep(.el-form-item__label) {
  display: block;
  max-width: 100%;
}
.grid :deep(.el-input),
.grid :deep(.el-select),
.grid :deep(.el-textarea) {
  width: 100%;
  min-width: 0;
}
.full {
  grid-column: 1 / -1;
}
.attachments {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-panel);
  padding: 16px;
  background: var(--surface-soft);
  min-height: 248px;
  overflow: hidden;
}
.attachments h3 {
  margin: 0 0 4px;
  color: var(--text-strong);
  min-height: 24px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.attachments .muted {
  min-height: 22px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.upload-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 18px;
  min-width: 0;
}
.attachment-label {
  display: block;
  width: 100%;
  min-height: 22px;
  line-height: 22px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.attachment-hint {
  color: var(--text-subtle);
  font-size: 12px;
  font-weight: 400;
}
.required-mark {
  margin-right: 4px;
  color: var(--status-danger);
  font-weight: 700;
}
:deep(.file-upload) {
  width: 100%;
  min-width: 0;
}
:deep(.file-upload .el-upload) {
  width: 112px;
}
:deep(.file-upload .el-upload .el-button) {
  width: 112px;
  min-width: 112px;
}
:deep(.file-upload .el-upload-list) {
  width: 100%;
}
:deep(.file-upload .el-upload-list__item) {
  align-items: flex-start;
  height: auto;
  min-height: 28px;
  padding: 4px 8px;
}
:deep(.file-upload .el-upload-list__item-info) {
  width: 100%;
  margin-left: 0;
  text-align: left;
}
:deep(.file-upload .el-upload-list__item-name) {
  display: block;
  width: calc(100% - 32px);
  max-width: none;
  text-align: left;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
  overflow: visible;
  text-overflow: clip;
  line-height: 1.35;
}
@media (max-width: 760px) {
  .grid,
  .upload-grid {
    grid-template-columns: 1fr;
  }
  .attachment-label {
    display: block;
  }
}
</style>
