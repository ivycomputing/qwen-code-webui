import { useState, useEffect, useCallback } from "react";
import {
  ComputerDesktopIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import {
  fetchRemoteMachines,
  type RemoteMachine,
} from "../api/openace";

interface RemoteMachineSelectorProps {
  onSelect: (machine: RemoteMachine) => void;
  selectedMachineId?: string;
}

/**
 * Returns an emoji icon based on os_type
 */
function getOsIcon(osType: string | null): string {
  if (!osType) return "\uD83D\uDDA5\uFE0F"; // 🖥️
  const lower = osType.toLowerCase();
  if (lower.includes("linux")) return "\uD83D\uDCBB"; // 💻
  if (lower.includes("darwin") || lower.includes("mac")) return "\uD83D\uDCBB"; // 💻
  if (lower.includes("windows") || lower.includes("win")) return "\uD83D\uDDA5\uFE0F"; // 🖥️
  return "\uD83D\uDDA5\uFE0F"; // 🖥️
}

/**
 * Returns a coloured status dot class based on machine status
 */
function getStatusDotColor(status: RemoteMachine["status"]): string {
  switch (status) {
    case "online":
      return "bg-green-500";
    case "busy":
      return "bg-yellow-500";
    case "offline":
      return "bg-slate-400";
    case "error":
      return "bg-red-500";
    default:
      return "bg-slate-400";
  }
}

function getStatusLabel(status: RemoteMachine["status"]): string {
  switch (status) {
    case "online":
      return "Online";
    case "busy":
      return "Busy";
    case "offline":
      return "Offline";
    case "error":
      return "Error";
    default:
      return status;
  }
}

export function RemoteMachineSelector({
  onSelect,
  selectedMachineId,
}: RemoteMachineSelectorProps) {
  const [machines, setMachines] = useState<RemoteMachine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMachines = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchRemoteMachines();
      setMachines(response.machines || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load remote machines");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMachines();
  }, [loadMachines]);

  const selectedMachine = machines.find(
    (m) => m.machine_id === selectedMachineId
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <svg
          className="animate-spin h-6 w-6 text-blue-600 mr-3"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <span className="text-slate-600 dark:text-slate-400">
          Loading remote machines...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 p-6">
        <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
        <button
          onClick={loadMachines}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300"
        >
          <ArrowPathIcon className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  if (machines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <ComputerDesktopIcon className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-3" />
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-3">
          No remote machines available
        </p>
        <button
          onClick={loadMachines}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300"
        >
          <ArrowPathIcon className="h-4 w-4" />
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Remote Machines
        </h3>
        <button
          onClick={loadMachines}
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400"
          title="Refresh machines"
        >
          <ArrowPathIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Machine list */}
      <div className="space-y-2">
        {machines.map((machine) => {
          const isSelected = machine.machine_id === selectedMachineId;
          const osIcon = getOsIcon(machine.os_type);

          return (
            <button
              key={machine.machine_id}
              onClick={() => onSelect(machine)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                isSelected
                  ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 ring-2 ring-blue-500"
                  : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Status dot */}
                <span
                  className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${getStatusDotColor(machine.status)}`}
                  title={getStatusLabel(machine.status)}
                />

                {/* OS icon */}
                <span className="text-lg flex-shrink-0">{osIcon}</span>

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-slate-800 dark:text-slate-100 truncate">
                    {machine.machine_name}
                  </div>
                  {machine.hostname && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {machine.hostname}
                    </div>
                  )}
                </div>

                {/* Status label */}
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    machine.status === "online"
                      ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                      : machine.status === "busy"
                        ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400"
                        : machine.status === "error"
                          ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                          : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {getStatusLabel(machine.status)}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected machine specs */}
      {selectedMachine && (
        <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-700/30 rounded-lg border border-slate-200 dark:border-slate-600">
          <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
            Machine Details
          </h4>
          <div className="space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
            {selectedMachine.os_type && (
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">OS</span>
                <span className="font-mono">
                  {selectedMachine.os_type}
                  {selectedMachine.os_version ? ` ${selectedMachine.os_version}` : ""}
                </span>
              </div>
            )}
            {selectedMachine.capabilities?.cpu_count != null && (
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">CPU</span>
                <span className="font-mono">
                  {selectedMachine.capabilities.cpu_count} cores
                </span>
              </div>
            )}
            {selectedMachine.capabilities?.memory_gb != null && (
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Memory</span>
                <span className="font-mono">
                  {selectedMachine.capabilities.memory_gb} GB
                </span>
              </div>
            )}
            {selectedMachine.capabilities?.gpu && (
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">GPU</span>
                <span className="font-mono">{selectedMachine.capabilities.gpu}</span>
              </div>
            )}
            {selectedMachine.capabilities?.disk_gb != null && (
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Disk</span>
                <span className="font-mono">
                  {selectedMachine.capabilities.disk_gb} GB
                </span>
              </div>
            )}
            {selectedMachine.last_heartbeat && (
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Last heartbeat</span>
                <span className="font-mono text-xs">
                  {new Date(selectedMachine.last_heartbeat).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
