import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AskUserQuestionDialog, type Question } from "./AskUserQuestionDialog";

// Mock useTranslation hook
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        "chat.askUserQuestionTitle": "Please answer the following question(s):",
        "chat.questionProgress": `Question ${params?.current} of ${params?.total}`,
        "chat.nextQuestion": "Next",
        "chat.otherOption": "Other",
        "chat.otherOptionPlaceholder": "Type your answer here...",
        "common.cancel": "Cancel",
        "common.done": "Done",
        "permission.autoApproveCountdown": `Auto-approving in ${params?.seconds}s`,
      };
      return translations[key] || key;
    },
  }),
}));

describe("AskUserQuestionDialog", () => {
  const singleQuestion: Question = {
    question: "Which library should we use?",
    header: "Library",
    options: [
      { label: "React (Recommended)", description: "A popular UI library" },
      { label: "Vue", description: "Another popular UI library" },
    ],
    multiSelect: false,
  };

  const multiSelectQuestion: Question = {
    question: "Which features do you want?",
    header: "Features",
    options: [
      { label: "Dark mode", description: "Enable dark theme" },
      { label: "Notifications", description: "Push notifications" },
    ],
    multiSelect: true,
  };

  const defaultProps = {
    questions: [singleQuestion],
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Basic rendering", () => {
    it("renders single question correctly", () => {
      render(<AskUserQuestionDialog {...defaultProps} />);

      expect(screen.getByText("Please answer the following question(s):")).toBeInTheDocument();
      expect(screen.getByText("Which library should we use?")).toBeInTheDocument();
      expect(screen.getByText("React (Recommended)")).toBeInTheDocument();
      expect(screen.getByText("Vue")).toBeInTheDocument();
      expect(screen.getByText("Other")).toBeInTheDocument();
      expect(screen.getByText("Done")).toBeInTheDocument();
      expect(screen.getByText("Cancel")).toBeInTheDocument();
    });

    it("renders multiple questions with tabs", () => {
      render(
        <AskUserQuestionDialog
          {...defaultProps}
          questions={[singleQuestion, multiSelectQuestion]}
        />
      );

      expect(screen.getByText("Question 1 of 2")).toBeInTheDocument();
      expect(screen.getByText("Library")).toBeInTheDocument();
      expect(screen.getByText("Features")).toBeInTheDocument();
    });

    it("renders multi-select question with checkbox indicators", () => {
      render(
        <AskUserQuestionDialog
          {...defaultProps}
          questions={[multiSelectQuestion]}
        />
      );

      expect(screen.getByText("Which features do you want?")).toBeInTheDocument();
      expect(screen.getByText("Dark mode")).toBeInTheDocument();
      expect(screen.getByText("Notifications")).toBeInTheDocument();
    });
  });

  describe("Option selection", () => {
    it("allows selecting single option", async () => {
      render(<AskUserQuestionDialog {...defaultProps} />);

      const reactOption = screen.getByText("React (Recommended)");
      await act(async () => {
        fireEvent.click(reactOption);
      });

      // Check if the option is selected (border turns blue)
      const button = reactOption.closest("button");
      expect(button).toHaveClass("border-blue-500");
    });

    it("allows selecting multiple options in multi-select mode", async () => {
      render(
        <AskUserQuestionDialog
          {...defaultProps}
          questions={[multiSelectQuestion]}
        />
      );

      const darkModeOption = screen.getByText("Dark mode");
      const notificationsOption = screen.getByText("Notifications");

      await act(async () => {
        fireEvent.click(darkModeOption);
      });
      await act(async () => {
        fireEvent.click(notificationsOption);
      });

      // Both should be selected
      const darkButton = darkModeOption.closest("button");
      const notifButton = notificationsOption.closest("button");
      expect(darkButton).toHaveClass("border-blue-500");
      expect(notifButton).toHaveClass("border-blue-500");
    });

    it("allows deselecting options in multi-select mode", async () => {
      render(
        <AskUserQuestionDialog
          {...defaultProps}
          questions={[multiSelectQuestion]}
        />
      );

      const darkModeOption = screen.getByText("Dark mode");

      await act(async () => {
        fireEvent.click(darkModeOption);
      });
      const darkButton = darkModeOption.closest("button");
      expect(darkButton).toHaveClass("border-blue-500");

      await act(async () => {
        fireEvent.click(darkModeOption);
      });
      expect(darkButton).not.toHaveClass("border-blue-500");
    });

    it("allows custom input via Other option for single select", async () => {
      render(<AskUserQuestionDialog {...defaultProps} />);

      const otherInput = screen.getByPlaceholderText("Type your answer here...");
      await act(async () => {
        fireEvent.change(otherInput, { target: { value: "Angular" } });
      });

      expect(otherInput).toHaveValue("Angular");
    });
  });

  describe("Navigation", () => {
    it("shows Next button when not last question", () => {
      render(
        <AskUserQuestionDialog
          {...defaultProps}
          questions={[singleQuestion, multiSelectQuestion]}
        />
      );

      expect(screen.getByText("Next")).toBeInTheDocument();
      expect(screen.queryByText("Done")).not.toBeInTheDocument();
    });

    it("navigates to next question when clicking Next", async () => {
      render(
        <AskUserQuestionDialog
          {...defaultProps}
          questions={[singleQuestion, multiSelectQuestion]}
        />
      );

      // Select an option for the first question
      await act(async () => {
        fireEvent.click(screen.getByText("React (Recommended)"));
      });

      // Click Next
      await act(async () => {
        fireEvent.click(screen.getByText("Next"));
      });

      // Should show second question
      expect(screen.getByText("Which features do you want?")).toBeInTheDocument();
      expect(screen.getByText("Question 2 of 2")).toBeInTheDocument();
    });

    it("switches questions via tabs", async () => {
      render(
        <AskUserQuestionDialog
          {...defaultProps}
          questions={[singleQuestion, multiSelectQuestion]}
        />
      );

      // Click on Features tab
      await act(async () => {
        fireEvent.click(screen.getByText("Features"));
      });

      expect(screen.getByText("Which features do you want?")).toBeInTheDocument();
    });
  });

  describe("Confirmation and cancellation", () => {
    it("calls onConfirm with answers when clicking Done", async () => {
      const onConfirm = vi.fn();
      render(<AskUserQuestionDialog {...defaultProps} onConfirm={onConfirm} />);

      await act(async () => {
        fireEvent.click(screen.getByText("React (Recommended)"));
      });
      await act(async () => {
        fireEvent.click(screen.getByText("Done"));
      });

      expect(onConfirm).toHaveBeenCalledWith({ "0": "React (Recommended)" });
    });

    it("calls onConfirm with multiple answers for multi-question", async () => {
      const onConfirm = vi.fn();
      render(
        <AskUserQuestionDialog
          {...defaultProps}
          questions={[singleQuestion, multiSelectQuestion]}
          onConfirm={onConfirm}
        />
      );

      // Answer first question
      await act(async () => {
        fireEvent.click(screen.getByText("React (Recommended)"));
      });
      await act(async () => {
        fireEvent.click(screen.getByText("Next"));
      });

      // Answer second question (multi-select)
      await act(async () => {
        fireEvent.click(screen.getByText("Dark mode"));
      });
      await act(async () => {
        fireEvent.click(screen.getByText("Notifications"));
      });
      await act(async () => {
        fireEvent.click(screen.getByText("Done"));
      });

      expect(onConfirm).toHaveBeenCalledWith({
        "0": "React (Recommended)",
        "1": "Dark mode, Notifications",
      });
    });

    it("calls onCancel when clicking Cancel", async () => {
      const onCancel = vi.fn();
      render(<AskUserQuestionDialog {...defaultProps} onCancel={onCancel} />);

      await act(async () => {
        fireEvent.click(screen.getByText("Cancel"));
      });

      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe("Keyboard navigation", () => {
    it("calls onCancel when pressing Escape", async () => {
      const onCancel = vi.fn();
      render(<AskUserQuestionDialog {...defaultProps} onCancel={onCancel} />);

      // Find the dialog container and fire event from within it
      const dialog = screen.getByRole("dialog");

      await act(async () => {
        fireEvent.keyDown(dialog, { key: "Escape" });
      });

      expect(onCancel).toHaveBeenCalled();
    });

    it("confirms when pressing Enter", async () => {
      const onConfirm = vi.fn();
      render(<AskUserQuestionDialog {...defaultProps} onConfirm={onConfirm} />);

      // Select an option first
      await act(async () => {
        fireEvent.click(screen.getByText("React (Recommended)"));
      });

      // Find the dialog container and fire event from within it
      const dialog = screen.getByRole("dialog");

      await act(async () => {
        fireEvent.keyDown(dialog, { key: "Enter" });
      });

      expect(onConfirm).toHaveBeenCalledWith({ "0": "React (Recommended)" });
    });

    it("does not trigger when event is outside dialog", async () => {
      const onCancel = vi.fn();
      const onConfirm = vi.fn();
      render(<AskUserQuestionDialog {...defaultProps} onCancel={onCancel} onConfirm={onConfirm} />);

      // Fire event on document (outside dialog) - should not trigger
      await act(async () => {
        fireEvent.keyDown(document, { key: "Escape" });
      });

      expect(onCancel).not.toHaveBeenCalled();

      await act(async () => {
        fireEvent.keyDown(document, { key: "Enter" });
      });

      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  describe("Auto-approve countdown", () => {
    it("shows countdown when autoApproveMs is set", () => {
      render(<AskUserQuestionDialog {...defaultProps} autoApproveMs={25000} />);

      expect(screen.getByText("Auto-approving in 25s")).toBeInTheDocument();
    });

    it("auto-approves after countdown reaches zero", async () => {
      const onConfirm = vi.fn();
      render(<AskUserQuestionDialog {...defaultProps} onConfirm={onConfirm} autoApproveMs={5000} />);

      // Wait for countdown to complete
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      expect(onConfirm).toHaveBeenCalled();
    });

    it("cancels countdown when user selects an option", async () => {
      const onConfirm = vi.fn();
      render(<AskUserQuestionDialog {...defaultProps} onConfirm={onConfirm} autoApproveMs={10000} />);

      // User selects an option
      await act(async () => {
        fireEvent.click(screen.getByText("React (Recommended)"));
      });

      // Advance timers past countdown - should NOT auto-approve
      await act(async () => {
        vi.advanceTimersByTime(10000);
      });

      // Should not auto-approve since user interacted
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it("cancels countdown when clicking Cancel", async () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();
      render(
        <AskUserQuestionDialog
          {...defaultProps}
          onConfirm={onConfirm}
          onCancel={onCancel}
          autoApproveMs={10000}
        />
      );

      await act(async () => {
        fireEvent.click(screen.getByText("Cancel"));
      });

      // Advance timers - should not auto-approve
      await act(async () => {
        vi.advanceTimersByTime(10000);
      });

      expect(onConfirm).not.toHaveBeenCalled();
      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe("Edge cases", () => {
    it("does not proceed if no option selected", async () => {
      const onConfirm = vi.fn();
      render(<AskUserQuestionDialog {...defaultProps} onConfirm={onConfirm} />);

      // Click Done without selecting anything
      await act(async () => {
        fireEvent.click(screen.getByText("Done"));
      });

      expect(onConfirm).not.toHaveBeenCalled();
    });

    it("handles questions with 4 options", () => {
      const fourOptionQuestion: Question = {
        question: "Choose a color?",
        header: "Color",
        options: [
          { label: "Red", description: "Red color" },
          { label: "Green", description: "Green color" },
          { label: "Blue", description: "Blue color" },
          { label: "Yellow", description: "Yellow color" },
        ],
        multiSelect: false,
      };

      render(<AskUserQuestionDialog {...defaultProps} questions={[fourOptionQuestion]} />);

      expect(screen.getByText("Red")).toBeInTheDocument();
      expect(screen.getByText("Green")).toBeInTheDocument();
      expect(screen.getByText("Blue")).toBeInTheDocument();
      expect(screen.getByText("Yellow")).toBeInTheDocument();
    });

    it("handles 4 questions with tabs", () => {
      const questions: Question[] = [
        { question: "Q1?", header: "H1", options: [{ label: "A1" }, { label: "B1" }], multiSelect: false },
        { question: "Q2?", header: "H2", options: [{ label: "A2" }, { label: "B2" }], multiSelect: false },
        { question: "Q3?", header: "H3", options: [{ label: "A3" }, { label: "B3" }], multiSelect: false },
        { question: "Q4?", header: "H4", options: [{ label: "A4" }, { label: "B4" }], multiSelect: false },
      ];

      render(<AskUserQuestionDialog {...defaultProps} questions={questions} />);

      expect(screen.getByText("H1")).toBeInTheDocument();
      expect(screen.getByText("H2")).toBeInTheDocument();
      expect(screen.getByText("H3")).toBeInTheDocument();
      expect(screen.getByText("H4")).toBeInTheDocument();
    });
  });
});