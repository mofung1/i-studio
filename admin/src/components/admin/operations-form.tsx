"use client";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/admin/ui/field";
import { Input } from "@/components/admin/ui/input";
import { Button } from "@/components/admin/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/admin/ui/tabs";

import {
  useEffect,
  useId,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Save } from "lucide-react";
import type { AdminOperations as Operations } from "@/lib/admin";
import styles from "./settings-forms.module.css";

const operationSections = [
  ["account", "账户与注册"],
  ["checkin", "每日签到"],
  ["announcement", "网站公告"],
  ["limits", "单用户上限"],
  ["budget", "平台额度"],
] as const;
export function AdminOperationsForm({
  ops,
  gift,
  giftBudget,
  checkinReward,
  checkinBudget,
  onCheckinRewardChange,
  onCheckinBudgetChange,
  creditAlert,
  onGiftBudgetChange,
  onCreditAlertChange,
  busy,
  onChange,
  onGiftChange,
  onSubmit,
  toolbarAction,
}: {
  ops: Operations;
  gift: string;
  giftBudget?: string;
  checkinReward: string;
  checkinBudget: string;
  onCheckinRewardChange: (value: string) => void;
  onCheckinBudgetChange: (value: string) => void;
  creditAlert?: string;
  onGiftBudgetChange?: (value: string) => void;
  onCreditAlertChange?: (value: string) => void;
  busy: boolean;
  onChange: (value: Operations) => void;
  onGiftChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  toolbarAction?: ReactNode;
}) {
  const formId = useId();
  const [section, setSection] = useState<string>(operationSections[0][0]);
  const [fieldToReport, setFieldToReport] = useState<
    HTMLInputElement | HTMLTextAreaElement | null
  >(null);

  useEffect(() => {
    if (!fieldToReport) return;
    fieldToReport.reportValidity();
    setFieldToReport(null);
  }, [fieldToReport]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const invalid = Array.from(event.currentTarget.elements).find(
      (field): field is HTMLInputElement | HTMLTextAreaElement =>
        (field instanceof HTMLInputElement ||
          field instanceof HTMLTextAreaElement) &&
        field.willValidate &&
        !field.validity.valid,
    );
    if (invalid) {
      const invalidSection = invalid.closest<HTMLElement>(
        "[data-operation-section]",
      )?.dataset.operationSection;
      if (invalidSection && invalidSection !== section) {
        setSection(invalidSection);
        setFieldToReport(invalid);
      } else {
        invalid.reportValidity();
      }
      return;
    }
    onSubmit(event);
  }

  return (
    <form
      className={`ops-card ops-form ${styles.operations}`}
      noValidate
      onSubmit={submit}
    >
      <Tabs
        value={section}
        onValueChange={setSection}
        className={styles.operationsTabs}
      >
        <div className={styles.operationsToolbar}>
          <TabsList
            aria-label="运营设置分组"
            className={styles.operationsTabList}
          >
            {operationSections.map(([id, title]) => (
              <TabsTrigger key={id} value={id} type="button">
                {title}
              </TabsTrigger>
            ))}
          </TabsList>
          {toolbarAction}
        </div>
        <TabsContent
          value="account"
          forceMount
          hidden={section !== "account"}
          data-operation-section="account"
          className={styles.operationsPanel}
        >
          <FieldSet className={styles.formSection} disabled={busy}>
            <FieldLegend className="sr-only">账户与注册</FieldLegend>
            <FieldGroup className="ops-form-grid">
              <Field>
                <FieldLabel className="settings-field">
                  <span>前台积分名称</span>
                  <Input
                    required
                    value={ops.creditName}
                    maxLength={12}
                    onChange={(event) =>
                      onChange({ ...ops, creditName: event.target.value })
                    }
                  />
                  <small>最多 12 字。</small>
                </FieldLabel>
              </Field>
              <Field>
                <FieldLabel className="settings-field">
                  <span>注册赠送数量</span>
                  <Input
                    required
                    inputMode="decimal"
                    value={gift}
                    onChange={(event) => onGiftChange(event.target.value)}
                  />
                  <small>0 关闭赠送，最多两位小数。</small>
                </FieldLabel>
              </Field>
            </FieldGroup>
            <div className="ops-form-switches">
              <label className="settings-switch">
                <input
                  type="checkbox"
                  checked={ops.registrationEnabled}
                  onChange={(event) =>
                    onChange({
                      ...ops,
                      registrationEnabled: event.target.checked,
                    })
                  }
                />
                开放新用户注册
              </label>
              <label className="settings-switch">
                <input
                  type="checkbox"
                  checked={ops.registrationInviteRequired ?? false}
                  onChange={(event) =>
                    onChange({
                      ...ops,
                      registrationInviteRequired: event.target.checked,
                    })
                  }
                />
                注册需要邀请码
              </label>
            </div>
            <Field>
              <FieldLabel className="settings-field">
                <span>设置或更换邀请码</span>
                <Input
                  type="text"
                  autoComplete="off"
                  value={ops.registrationInviteCode ?? ""}
                  minLength={8}
                  maxLength={64}
                  pattern="[A-Za-z0-9_\-]{8,64}"
                  onChange={(event) =>
                    onChange({
                      ...ops,
                      registrationInviteCode: event.target.value,
                    })
                  }
                  placeholder={
                    ops.registrationInviteConfigured
                      ? "已配置"
                      : "尚未配置"
                  }
                />
                <small>
                  8–64 位字母、数字、下划线或短横线。留空保留已设的邀请码。旧码不可见时，重新填写并保存即可查看。
                </small>
              </FieldLabel>
            </Field>
          </FieldSet>
        </TabsContent>
        <TabsContent
          value="checkin"
          forceMount
          hidden={section !== "checkin"}
          data-operation-section="checkin"
          className={styles.operationsPanel}
        >
          <FieldSet className={styles.formSection} disabled={busy}>
            <FieldLegend className="sr-only">每日签到</FieldLegend>
            <Field>
              <label className="settings-switch">
                <input
                  type="checkbox"
                  checked={ops.checkinEnabled ?? false}
                  aria-describedby={`${formId}-checkin-help`}
                  onChange={(event) =>
                    onChange({ ...ops, checkinEnabled: event.target.checked })
                  }
                />
                开启每日签到奖励
              </label>
              <small id={`${formId}-checkin-help`} className={styles.fieldHelp}>
                关闭后保留奖励与预算设置。
              </small>
            </Field>
            <FieldGroup className="ops-form-grid">
              <Field>
                <FieldLabel className="settings-field">
                  <span>每次签到赠送数量</span>
                  <Input
                    required
                    inputMode="decimal"
                    value={checkinReward}
                    onChange={(event) =>
                      onCheckinRewardChange(event.target.value)
                    }
                  />
                  <small>
                    0 关闭发放，最多两位小数。每账号按北京时间每日领取一次。
                  </small>
                </FieldLabel>
              </Field>
              <Field>
                <FieldLabel className="settings-field">
                  <span>每日签到赠送总预算</span>
                  <Input
                    required
                    inputMode="decimal"
                    value={checkinBudget}
                    onChange={(event) =>
                      onCheckinBudgetChange(event.target.value)
                    }
                  />
                  <small>
                    全站共用（{ops.creditName}）。预算为 0 或不足时暂停领取，已到账奖励保留。
                  </small>
                </FieldLabel>
              </Field>
            </FieldGroup>
          </FieldSet>
        </TabsContent>
        <TabsContent
          value="announcement"
          forceMount
          hidden={section !== "announcement"}
          data-operation-section="announcement"
          className={styles.operationsPanel}
        >
          <FieldSet className={styles.formSection} disabled={busy}>
            <FieldLegend className="sr-only">网站公告</FieldLegend>
            <label className="settings-switch">
              <input
                type="checkbox"
                checked={ops.announcementEnabled ?? false}
                onChange={(event) =>
                  onChange({
                    ...ops,
                    announcementEnabled: event.target.checked,
                  })
                }
              />
              发布公告
            </label>
            <FieldGroup>
              <Field>
                <FieldLabel className="settings-field">
                  <span>公告标题</span>
                  <Input
                    value={ops.announcementTitle ?? ""}
                    maxLength={60}
                    required={ops.announcementEnabled}
                    onChange={(event) =>
                      onChange({
                        ...ops,
                        announcementTitle: event.target.value,
                      })
                    }
                  />
                </FieldLabel>
              </Field>
              <Field>
                <FieldLabel className="settings-field">
                  <span>公告正文</span>
                  <textarea
                    className="ops-announcement-content"
                    value={ops.announcementContent ?? ""}
                    maxLength={2000}
                    required={ops.announcementEnabled}
                    onChange={(event) =>
                      onChange({
                        ...ops,
                        announcementContent: event.target.value,
                      })
                    }
                  />
                  <small>
                    纯文本，可换行。开启发布并保存后在前台展示，内容更新会再次提示。
                  </small>
                </FieldLabel>
              </Field>
            </FieldGroup>
          </FieldSet>
        </TabsContent>
        <TabsContent
          value="limits"
          forceMount
          hidden={section !== "limits"}
          data-operation-section="limits"
          className={styles.operationsPanel}
        >
          <FieldSet className={styles.formSection} disabled={busy}>
            <FieldLegend className="sr-only">单用户上限</FieldLegend>
            <p className={styles.sectionHelp}>
              每个账号单独计数，每小时上限按最近 60 分钟计算。
            </p>
            <FieldGroup className="ops-form-grid">
              {(
                [
                  ["maxConcurrentTasks", "同时生成任务数", 16],
                  ["generationRequestsPerHour", "每小时生成任务数", 1000],
                  ["auxiliaryRequestsPerHour", "每小时辅助请求数", 1000],
                ] as const
              ).map(([key, label, max]) => (
                <Field key={key}>
                  <FieldLabel className="settings-field">
                    <span>{label}</span>
                    <Input
                      type="number"
                      required
                      min={1}
                      max={max}
                      value={ops[key]}
                      aria-describedby={
                        key === "auxiliaryRequestsPerHour"
                          ? `${formId}-auxiliary-help`
                          : undefined
                      }
                      onChange={(event) =>
                        onChange({ ...ops, [key]: Number(event.target.value) })
                      }
                    />
                  </FieldLabel>
                  {key === "auxiliaryRequestsPerHour" && (
                    <small
                      id={`${formId}-auxiliary-help`}
                      className={styles.fieldHelp}
                    >
                      提示词优化、图片反推、商品与服装分析共用上限，站内费用为 0 积分。
                    </small>
                  )}
                </Field>
              ))}
            </FieldGroup>
          </FieldSet>
        </TabsContent>
        <TabsContent
          value="budget"
          forceMount
          hidden={section !== "budget"}
          data-operation-section="budget"
          className={styles.operationsPanel}
        >
          <FieldSet className={styles.formSection} disabled={busy}>
            <FieldLegend className="sr-only">平台额度</FieldLegend>
            <FieldGroup className="ops-form-grid">
              {(
                [
                  [
                    "platformAuxiliaryConcurrent",
                    "平台同时辅助请求数",
                    1,
                    100,
                    4,
                    "全站共用，已开始的请求可继续执行。",
                  ],
                  [
                    "platformAuxiliaryPerDay",
                    "平台每日辅助请求总数",
                    1,
                    1000000,
                    1000,
                    "按北京时间自然日统计。实际开始即计数，失败也计入。",
                  ],
                ] as const
              ).map(([key, label, min, max, fallback, help]) => (
                <Field key={key}>
                  <FieldLabel className="settings-field">
                    <span>{label}</span>
                    <Input
                      type="number"
                      required
                      min={min}
                      max={max}
                      step={1}
                      value={ops[key] ?? fallback}
                      aria-describedby={`${formId}-${key}-help`}
                      onChange={(event) =>
                        onChange({ ...ops, [key]: Number(event.target.value) })
                      }
                    />
                  </FieldLabel>
                  <small
                    id={`${formId}-${key}-help`}
                    className={styles.fieldHelp}
                  >
                    {help}
                  </small>
                </Field>
              ))}
              <Field>
                <FieldLabel className="settings-field">
                  <span>每日注册赠送总预算</span>
                  <Input
                    required
                    inputMode="decimal"
                    value={giftBudget ?? "1000"}
                    onChange={(event) =>
                      onGiftBudgetChange?.(event.target.value)
                    }
                  />
                  <small>
                    北京时间每日额度（{ops.creditName}），0 为无赠送预算。预算不足以全额赠送时暂停新注册。
                  </small>
                </FieldLabel>
              </Field>
              <Field>
                <FieldLabel className="settings-field">
                  <span>每日消耗告警阈值</span>
                  <Input
                    required
                    inputMode="decimal"
                    value={creditAlert ?? "1000"}
                    onChange={(event) =>
                      onCreditAlertChange?.(event.target.value)
                    }
                  />
                  <small>
                    按北京时间统计站内消耗（{ops.creditName}），0 关闭。达到阈值仅在运营概览提示，供应商费用以账单为准。
                  </small>
                </FieldLabel>
              </Field>
              <Field>
                <FieldLabel className="settings-field">
                  <span>每账号存储额度（MiB）</span>
                  <Input
                    type="number"
                    required
                    min={1}
                    max={1048576}
                    step={1}
                    value={
                      (ops.accountStorageLimitBytes ?? 1073741824) / 1048576
                    }
                    onChange={(event) =>
                      onChange({
                        ...ops,
                        accountStorageLimitBytes:
                          Number(event.target.value) * 1048576,
                      })
                    }
                  />
                  <small>
                    作品、素材、历史引用图片和反推暂存均计入。降低额度仅限制后续写入。
                  </small>
                </FieldLabel>
              </Field>
            </FieldGroup>
          </FieldSet>
        </TabsContent>
      </Tabs>
      <div className={styles.operationsFooter}>
        <p id={`${formId}-save-help`}>应用所有标签页的修改。</p>
        <Button
          type="submit"
          disabled={busy}
          aria-describedby={`${formId}-save-help`}
        >
          <Save data-icon="inline-start" />
          {busy ? "保存中…" : "保存全部设置"}
        </Button>
      </div>
    </form>
  );
}
