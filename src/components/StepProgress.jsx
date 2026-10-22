import { memo, useMemo } from "react";
import { CheckIcon } from "./icons.jsx";
import { useLanguage } from "../state/LanguageContext.jsx";

/**
 * Where you are in a multi-step form: one dot per step, a check on every
 * completed step, and the current step named in words.
 *
 * Built for the close-shift flow, where the steps are optional except the
 * first — a dot fills when that step has something in it (or needs nothing),
 * and the label says the first step that still wants attention. When every
 * dot is filled the label switches to a single "ready to send" state, so the
 * progress bar doubles as a pre-flight check without blocking anything.
 *
 * Colour is never the only signal: completed dots carry a check mark, the
 * current dot is the only ringed one, and the text label always spells out
 * the step.
 *
 * Memoized: steps array identity can change on every render; we derive
 * `firstOpen`/`complete`/`label` via useMemo to avoid recomputing.
 */
function StepProgress({ steps }) {
  const { t } = useLanguage();

  const { firstOpen, complete, activeIndex, label } = useMemo(() => {
    const open = steps.findIndex((step) => !step.done);
    const done = open === -1;
    const active = done ? steps.length - 1 : open;
    const text = done
      ? t("close.readyToSend")
      : t("close.stepLabel", {
          step: active + 1,
          count: steps.length,
          label: steps[active].label,
        });
    return { firstOpen: open, complete: done, activeIndex: active, label: text };
  }, [steps, t]);

  return (
    <div
      className="step-progress"
      data-active={activeIndex + 1}
      data-count={steps.length}
      data-complete={complete || undefined}
      role="group"
      aria-label={label}
    >
      <ol className="step-progress__dots" aria-hidden="true">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className="step-progress__dot"
            data-state={step.done ? "done" : index === activeIndex ? "current" : "todo"}
            title={step.label}
          >
            <span className="step-progress__dot-inner">
              {step.done ? <CheckIcon size={12} /> : index + 1}
            </span>
          </li>
        ))}
      </ol>
      <div className="step-progress__label">
        {complete && (
          <span className="step-progress__label-icon" aria-hidden="true">
            <CheckIcon size={13} />
          </span>
        )}
        <span className="step-progress__label-text">{label}</span>
      </div>
    </div>
  );
}

export default memo(StepProgress);
