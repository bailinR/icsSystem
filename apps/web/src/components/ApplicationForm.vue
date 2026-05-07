<script setup lang="ts">
import type { UploadUserFile } from 'element-plus';
import { reactive, watch } from 'vue';
import type { Application } from '../api';

export type PendingFiles = Record<'CHAT_RECORD' | 'VOUCHER' | 'CONTRACT' | 'OTHER', UploadUserFile[]>;

const props = defineProps<{ model?: Partial<Application> }>();
const emit = defineEmits<{ save: [value: Record<string, string>, files: PendingFiles] }>();

const currencies = ['USD', 'CNY', 'EUR', 'GBP', 'JPY', 'KRW', 'SGD', 'THB', 'VND', 'IDR', 'MYR', 'PHP'];
const form = reactive({
  influencerName: '',
  contact: '',
  amount: '',
  currency: '',
  paymentMethod: '',
  homepage: '',
  remark: '',
});
const files = reactive<PendingFiles>({
  CHAT_RECORD: [],
  VOUCHER: [],
  CONTRACT: [],
  OTHER: [],
});

const uploadGroups = [
  { key: 'CHAT_RECORD', label: '聊天记录 / Chat records', accept: 'image/jpeg,image/png', hint: '仅图片：jpg、jpeg、png' },
  { key: 'VOUCHER', label: '凭证 / Voucher', accept: 'image/jpeg,image/png', hint: '仅图片：jpg、jpeg、png' },
  { key: 'CONTRACT', label: '合同 / Contract', accept: 'image/jpeg,image/png,application/pdf', hint: '图片或 PDF' },
  { key: 'OTHER', label: '全部附件 / All files', accept: 'image/jpeg,image/png,application/pdf,.doc,.docx', hint: '图片、PDF、Word' },
] as const;

watch(
  () => props.model,
  (model) => {
    Object.assign(form, {
      influencerName: model?.influencerName || '',
      contact: model?.contact || '',
      amount: model?.amount ? String(model.amount) : '',
      currency: model?.currency || '',
      paymentMethod: model?.paymentMethod || '',
      homepage: model?.homepage || '',
      remark: model?.remark || '',
    });
    Object.keys(files).forEach((key) => {
      files[key as keyof PendingFiles] = [];
    });
  },
  { immediate: true },
);
</script>

<template>
  <el-form label-position="top" class="grid">
    <el-form-item label="达人名称 / Influencer">
      <el-input v-model="form.influencerName" />
    </el-form-item>
    <el-form-item label="联系方式 / Contact">
      <el-input v-model="form.contact" />
    </el-form-item>
    <el-form-item label="合作金额 / Amount">
      <el-input v-model="form.amount" />
    </el-form-item>
    <el-form-item label="币种 / Currency">
      <el-select v-model="form.currency" filterable clearable placeholder="请选择币种">
        <el-option v-for="currency in currencies" :key="currency" :label="currency" :value="currency" />
      </el-select>
    </el-form-item>
    <el-form-item label="收款方式 / Payment Method">
      <el-input v-model="form.paymentMethod" />
    </el-form-item>
    <el-form-item label="达人主页 / Homepage">
      <el-input v-model="form.homepage" />
    </el-form-item>
    <el-form-item label="备注 / Remark" class="full">
      <el-input v-model="form.remark" type="textarea" :rows="4" />
    </el-form-item>

    <section class="full attachments">
      <h3>申请附件 / Attachments</h3>
      <p class="muted">所有附件均为选填；单个文件最大 20MB，图片总数最多 10 张。</p>
      <div class="upload-grid">
        <el-form-item v-for="group in uploadGroups" :key="group.key">
          <template #label>
            <span class="attachment-label">
              {{ group.label }}
              <span class="attachment-hint">（{{ group.hint }}）</span>
            </span>
          </template>
          <el-upload
            v-model:file-list="files[group.key]"
            :auto-upload="false"
            :accept="group.accept"
            multiple
          >
            <el-button>选择文件</el-button>
          </el-upload>
        </el-form-item>
      </div>
    </section>

    <el-form-item class="full">
      <el-button type="primary" @click="emit('save', form, files)">保存 / Save</el-button>
    </el-form-item>
  </el-form>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 20px;
}
.full {
  grid-column: 1 / -1;
}
.attachments {
  border: 1px solid #e6ebef;
  border-radius: 16px;
  padding: 16px;
  background: #fbfdfb;
}
.attachments h3 {
  margin: 0 0 4px;
}
.upload-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 18px;
}
.attachment-label {
  display: inline-flex;
  align-items: baseline;
  gap: 2px;
  line-height: 1.35;
}
.attachment-hint {
  color: #7a8a99;
  font-size: 12px;
  font-weight: 400;
}
@media (max-width: 760px) {
  .grid,
  .upload-grid {
    grid-template-columns: 1fr;
  }
  .attachment-label {
    display: inline;
  }
}
</style>
