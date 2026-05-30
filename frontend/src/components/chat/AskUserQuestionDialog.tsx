import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface Question {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

export interface AskUserQuestionDialogProps {
  questions: Question[];
  autoApproveMs?: number;
  onConfirm: (answers: Record<string, string>) => void;
  onCancel: () => void;
}

export function AskUserQuestionDialog({
  questions,
  autoApproveMs,
  onConfirm,
  onCancel,
}: AskUserQuestionDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [multiSelectAnswers, setMultiSelectAnswers] = useState<Record<string, string[]>>({});
  const [countdown, setCountdown] = useState<number | null>(null);
  const autoApprovedRef = useRef<boolean>(false);
  const countdownCancelledRef = useRef<boolean>(false);

  const currentQuestion = questions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === questions.length - 1;

  // Cancel countdown when user interacts
  const cancelCountdown = useCallback(() => {
    countdownCancelledRef.current = true;
    setCountdown(null);
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!autoApproveMs) return;
    const seconds = Math.ceil(autoApproveMs / 1000);
    setCountdown(seconds);

    const interval = setInterval(() => {
      if (countdownCancelledRef.current) {
        clearInterval(interval);
        return;
      }
      setCountdown((prev: number | null) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [autoApproveMs]);

  // Auto-approve first option when countdown hits 0
  useEffect(() => {
    if (countdown === 0 && !autoApprovedRef.current && !countdownCancelledRef.current) {
      autoApprovedRef.current = true;
      // Auto-select first option for all questions
      const autoAnswers: Record<string, string> = {};
      questions.forEach((q, index) => {
        autoAnswers[index.toString()] = q.options[0]?.label || "";
      });
      onConfirm(autoAnswers);
    }
  }, [countdown, questions, onConfirm]);

  // Handle single-select option click
  const handleSingleSelect = useCallback((optionLabel: string) => {
    cancelCountdown();
    setAnswers((prev: Record<string, string>) => ({
      ...prev,
      [currentQuestionIndex.toString()]: optionLabel,
    }));
  }, [currentQuestionIndex, cancelCountdown]);

  // Handle multi-select option click
  const handleMultiSelect = useCallback((optionLabel: string) => {
    cancelCountdown();
    setMultiSelectAnswers((prev: Record<string, string[]>) => {
      const current: string[] = prev[currentQuestionIndex.toString()] || [];
      const isSelected: boolean = current.includes(optionLabel);
      const newSelection: string[] = isSelected
        ? current.filter((l: string) => l !== optionLabel)
        : [...current, optionLabel];
      return {
        ...prev,
        [currentQuestionIndex.toString()]: newSelection,
      };
    });
  }, [currentQuestionIndex, cancelCountdown]);

  // Handle "Other" option for single-select
  const handleOtherInput = useCallback((value: string) => {
    cancelCountdown();
    setAnswers((prev: Record<string, string>) => ({
      ...prev,
      [currentQuestionIndex.toString()]: value,
    }));
  }, [currentQuestionIndex, cancelCountdown]);

  // Handle "Other" option for multi-select
  const handleMultiOtherInput = useCallback((value: string) => {
    cancelCountdown();
    setMultiSelectAnswers((prev: Record<string, string[]>) => {
      const current: string[] = prev[currentQuestionIndex.toString()] || [];
      // Remove previous "Other" if exists
      const filtered: string[] = current.filter((l: string) => l !== t("chat.otherOption"));
      if (value) {
        return {
          ...prev,
          [currentQuestionIndex.toString()]: [...filtered, value],
        };
      }
      return {
        ...prev,
        [currentQuestionIndex.toString()]: filtered,
      };
    });
  }, [currentQuestionIndex, cancelCountdown, t]);

  // Navigate to next question or confirm
  const handleNextOrConfirm = useCallback(() => {
    cancelCountdown();

    // Check if current question is answered
    const currentAnswer: string | string[] | undefined = currentQuestion.multiSelect
      ? multiSelectAnswers[currentQuestionIndex.toString()]
      : answers[currentQuestionIndex.toString()];

    if (!currentAnswer || (Array.isArray(currentAnswer) && currentAnswer.length === 0)) {
      // No answer selected, could show error but for now just don't proceed
      return;
    }

    if (isLastQuestion) {
      // Compile final answers
      const finalAnswers: Record<string, string> = {};
      questions.forEach((_q, index: number) => {
        if (questions[index].multiSelect) {
          const selected: string[] = multiSelectAnswers[index.toString()] || [];
          finalAnswers[index.toString()] = selected.join(", ");
        } else {
          finalAnswers[index.toString()] = answers[index.toString()] || "";
        }
      });
      onConfirm(finalAnswers);
    } else {
      setCurrentQuestionIndex((prev: number) => prev + 1);
    }
  }, [
    cancelCountdown,
    currentQuestion,
    currentQuestionIndex,
    isLastQuestion,
    questions,
    answers,
    multiSelectAnswers,
    onConfirm,
  ]);

  // Handle keyboard navigation - scoped to dialog only
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if event is from within the dialog
      if (!dialogRef.current?.contains(e.target as Node)) return;

      if (e.key === "Escape") {
        e.preventDefault();
        cancelCountdown();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleNextOrConfirm();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [cancelCountdown, onCancel, handleNextOrConfirm]);

  // Get current answer state
  const currentSingleAnswer: string | undefined = answers[currentQuestionIndex.toString()];
  const currentMultiAnswers: string[] = multiSelectAnswers[currentQuestionIndex.toString()] || [];

  // Check if "Other" is selected
  const isOtherSelectedInMulti: boolean = currentMultiAnswers.some((a: string) =>
    !currentQuestion.options.some((o: QuestionOption) => o.label === a)
  );
  const isOtherSelectedInSingle: boolean = currentSingleAnswer !== undefined &&
    !currentQuestion.options.some((o: QuestionOption) => o.label === currentSingleAnswer);

  // Generate unique ID for accessibility
  const questionId = `question-${currentQuestionIndex}`;
  const optionsGroupId = `options-${currentQuestionIndex}`;

  return (
    <div
      ref={dialogRef}
      className="flex-shrink-0 px-4 py-4 bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl backdrop-blur-sm shadow-sm"
      role="dialog"
      aria-labelledby="dialog-title"
      aria-modal="true"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
          <ExclamationTriangleIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
        </div>
        <div>
          <h3 id="dialog-title" className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            {t("chat.askUserQuestionTitle")}
          </h3>
          {questions.length > 1 && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t("chat.questionProgress", { current: currentQuestionIndex + 1, total: questions.length })}
            </p>
          )}
        </div>
      </div>

      {/* Countdown banner */}
      {countdown !== null && countdown > 0 && (
        <div className="mb-3 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg" role="status">
          <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
            {t("permission.autoApproveCountdown", { seconds: countdown })}
          </p>
          <div className="mt-1 h-1 bg-blue-200 dark:bg-blue-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 dark:bg-blue-400 rounded-full transition-all duration-1000 ease-linear"
              style={{ width: `${(countdown / Math.ceil((autoApproveMs ?? 25000) / 1000)) * 100}%` }}
              aria-hidden="true"
            />
          </div>
        </div>
      )}

      {/* Question tabs for multiple questions */}
      {questions.length > 1 && (
        <div className="flex gap-2 mb-4" role="tablist" aria-label="Questions">
          {questions.map((q, index) => (
            <button
              key={index}
              role="tab"
              aria-selected={index === currentQuestionIndex}
              aria-controls={questionId}
              onClick={() => {
                cancelCountdown();
                setCurrentQuestionIndex(index);
              }}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                index === currentQuestionIndex
                  ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                  : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600"
              }`}
            >
              {q.header}
            </button>
          ))}
        </div>
      )}

      {/* Current question */}
      <div className="mb-4">
        <p id={questionId} className="text-slate-700 dark:text-slate-300 font-medium mb-3">
          {currentQuestion.question}
        </p>

        {/* Options */}
        <div
          id={optionsGroupId}
          className="space-y-2"
          role={currentQuestion.multiSelect ? "group" : "radiogroup"}
          aria-labelledby={questionId}
        >
          {currentQuestion.options.map((option, index) => {
            const isSelected = currentQuestion.multiSelect
              ? currentMultiAnswers.includes(option.label)
              : currentSingleAnswer === option.label;

            return (
              <button
                key={index}
                role={currentQuestion.multiSelect ? "checkbox" : "radio"}
                aria-checked={isSelected}
                onClick={() => {
                  if (currentQuestion.multiSelect) {
                    handleMultiSelect(option.label);
                  } else {
                    handleSingleSelect(option.label);
                  }
                }}
                className={`w-full p-3 rounded-lg border transition-all text-left ${
                  isSelected
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500"
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Radio/Checkbox indicator */}
                  <div
                    className={`flex-shrink-0 w-4 h-4 mt-1 ${
                      currentQuestion.multiSelect ? "rounded" : "rounded-full"
                    } ${
                      isSelected
                        ? "bg-blue-500 border-blue-500"
                        : "border-2 border-slate-300 dark:border-slate-500"
                    }`}
                    aria-hidden="true"
                  >
                    {isSelected && (
                      <svg
                        className="w-4 h-4 text-white"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        {currentQuestion.multiSelect ? (
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        ) : (
                          <circle cx="10" cy="10" r="4" />
                        )}
                      </svg>
                    )}
                  </div>
                  <div className="flex-1">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {option.label}
                    </span>
                    {option.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {option.description}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}

          {/* Other option */}
          <div
            className={`w-full p-3 rounded-lg border transition-all ${
              currentQuestion.multiSelect
                ? isOtherSelectedInMulti
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                  : "border-slate-200 dark:border-slate-600"
                : isOtherSelectedInSingle
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                  : "border-slate-200 dark:border-slate-600"
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`flex-shrink-0 w-4 h-4 mt-1 ${
                  currentQuestion.multiSelect ? "rounded" : "rounded-full"
                } border-2 border-slate-300 dark:border-slate-500`}
                aria-hidden="true"
              />
              <div className="flex-1">
                <label className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  {t("chat.otherOption")}
                </label>
                <input
                  type="text"
                  placeholder={t("chat.otherOptionPlaceholder")}
                  className="mt-2 w-full px-2 py-1 text-sm bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  onChange={(e) => {
                    if (currentQuestion.multiSelect) {
                      handleMultiOtherInput(e.target.value);
                    } else {
                      handleOtherInput(e.target.value);
                    }
                  }}
                  aria-label={t("chat.otherOption")}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => {
            cancelCountdown();
            onCancel();
          }}
          className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-all"
        >
          {t("common.cancel")}
        </button>
        <button
          onClick={handleNextOrConfirm}
          data-permission-action="allow"
          className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-all"
        >
          {isLastQuestion ? t("common.done") : t("chat.nextQuestion")}
        </button>
      </div>
    </div>
  );
}