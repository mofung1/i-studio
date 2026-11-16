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

import { useEffect, useState, type FormEvent } from "react";
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
}) {
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
        <TabsContent
          value="account"
          forceMount
          hidden={section !== "account"}
          data-operation-section="account"
          className={styles.operationsPanel}
        >
          <FieldSet className={styles.formSection} disabled={busy}>
            <FieldLegend>账户与注册</FieldLegend>
            <p className={styles.sectionHelp}>
              决定谁能注册、注册时获得多少积分，以及前台显示的积分名称。
            </p>
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
                  <small>例如：积分、点数、创作币</small>
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
                  <small>0 表示不赠送，最多保留两位小数</small>
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
                      ? "已配置，留空保留原邀请码"
                      : "尚未配置"
                  }
                />
                <small>
                  8–64
                  位字母、数字、下划线或短横线。保存后在管理员后台直接显示；旧版仅保存哈希的邀请码需重新填写一次才能显示。
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
            <FieldLegend>每日签到</FieldLegend>
            <p className={styles.sectionHelp}>
              单次奖励与全平台每日预算分别设置，关闭签到后保留已填写的参数。
            </p>
            <label className="settings-switch">
              <input
                type="checkbox"
                checked={ops.checkinEnabled ?? false}
                onChange={(event) =>
                  onChange({ ...ops, checkinEnabled: event.target.checked })
                }
              />
              开启每日签到奖励
            </label>
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
                    0 表示不发放，最多两位小数；每账号按北京时间每天领取一次。
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
                    单位：{ops.creditName}。0
                    或剩余额度不足时暂停领取，不影响已到账奖励。
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
            <FieldLegend>网站公告</FieldLegend>
            <p className={styles.sectionHelp}>
              编辑面向前台用户的消息，勾选“发布公告”并保存后展示。
            </p>
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
                    纯文本显示，支持换行；发布后前台可查看，内容更新会重新提示。
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
            <FieldLegend>单用户使用上限</FieldLegend>
            <p className={styles.sectionHelp}>
              限制每个账号的并发与请求频率。全平台共享额度可在「平台额度」中设置。
            </p>
            <FieldGroup className="ops-form-grid">
              {(
                [
                  ["maxConcurrentTasks", "同时生成任务数", 16],
                  ["generationRequestsPerHour", "每小时生成任务数", 1000],
                  ["auxiliaryRequestsPerHour", "每小时提示词辅助次数", 1000],
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
                      onChange={(event) =>
                        onChange({ ...ops, [key]: Number(event.target.value) })
                      }
                    />
                  </FieldLabel>
                </Field>
              ))}
            </FieldGroup>
            <p>
              提示词优化、图片反推和服装分析共用辅助次数上限，首版不另扣积分。
            </p>
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
            <FieldLegend>平台额度与告警</FieldLegend>
            <p className={styles.sectionHelp}>
              区分平台请求上限、积分预算和告警阈值，避免将站内积分误认为供应商账单。
            </p>
            <FieldGroup className="ops-form-grid">
              {(
                [
                  [
                    "platformAuxiliaryConcurrent",
                    "平台同时辅助请求数",
                    1,
                    100,
                    4,
                  ],
                  [
                    "platformAuxiliaryPerDay",
                    "平台每日辅助请求总数",
                    1,
                    1000000,
                    1000,
                  ],
                ] as const
              ).map(([key, label, min, max, fallback]) => (
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
                      onChange={(event) =>
                        onChange({ ...ops, [key]: Number(event.target.value) })
                      }
                    />
                  </FieldLabel>
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
                    单位：{ops.creditName}。0
                    表示没有赠送预算；不足以全额赠送时暂停新注册，不少发承诺数量。
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
                    单位：{ops.creditName}。0
                    关闭；达到阈值在运营概览提示，不中止已创建任务。
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
                    包括作品、素材、仍被历史引用的图片及反推暂存。降低额度不删除已有内容。
                  </small>
                </FieldLabel>
              </Field>
            </FieldGroup>
            <p>
              每日额度按北京时间自然日计算。辅助额度按实际开始的请求计数，失败也占用次数；已创建任务继续完成。这里的积分和次数不代表供应商真实账单。
            </p>
          </FieldSet>
        </TabsContent>
      </Tabs>
      <div className={styles.operationsFooter}>
        <p>保存时会应用所有标签页的修改。</p>
        <Button type="submit" disabled={busy}>
          <Save data-icon="inline-start" />
          {busy ? "保存中…" : "保存设置"}
        </Button>
      </div>
    </form>
  );
}
