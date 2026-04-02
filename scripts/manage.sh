#!/bin/bash
#
# Server management script for Qwen Code Web UI
# Usage: ./scripts/manage.sh {start|stop|restart|status|logs}
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PID_DIR="$PROJECT_ROOT/.dev"
BACKEND_PID_FILE="$PID_DIR/backend.pid"
FRONTEND_PID_FILE="$PID_DIR/frontend.pid"
BACKEND_LOG="$PID_DIR/backend.log"
FRONTEND_LOG="$PID_DIR/frontend.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Ensure PID directory exists
ensure_pid_dir() {
    mkdir -p "$PID_DIR"
}

# Check if a process is running
is_running() {
    local pid_file="$1"
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if ps -p "$pid" > /dev/null 2>&1; then
            return 0
        fi
    fi
    return 1
}

# Environment variables for backend
export OPENACE_API_URL="${OPENACE_API_URL:-http://localhost:5001}"
export QUOTA_CHECK_ENABLED="${QUOTA_CHECK_ENABLED:-true}"

# Start backend server
start_backend() {
    if is_running "$BACKEND_PID_FILE"; then
        echo -e "${YELLOW}Backend is already running (PID: $(cat $BACKEND_PID_FILE))${NC}"
        return 0
    fi

    echo -e "${BLUE}Starting backend server...${NC}"
    echo -e "  OPENACE_API_URL=${OPENACE_API_URL}"
    echo -e "  QUOTA_CHECK_ENABLED=${QUOTA_CHECK_ENABLED}"
    ensure_pid_dir

    cd "$PROJECT_ROOT/backend"

    # Start backend in background
    nohup npm run dev > "$BACKEND_LOG" 2>&1 &
    local pid=$!
    echo $pid > "$BACKEND_PID_FILE"

    # Wait a moment and verify it started
    sleep 2
    if ps -p $pid > /dev/null 2>&1; then
        echo -e "${GREEN}Backend started (PID: $pid)${NC}"
        echo -e "  Log file: $BACKEND_LOG"
    else
        echo -e "${RED}Failed to start backend. Check log: $BACKEND_LOG${NC}"
        return 1
    fi
}

# Start frontend server
start_frontend() {
    if is_running "$FRONTEND_PID_FILE"; then
        echo -e "${YELLOW}Frontend is already running (PID: $(cat $FRONTEND_PID_FILE))${NC}"
        return 0
    fi

    echo -e "${BLUE}Starting frontend server...${NC}"
    ensure_pid_dir

    cd "$PROJECT_ROOT/frontend"

    # Start frontend in background
    nohup npm run dev > "$FRONTEND_LOG" 2>&1 &
    local pid=$!
    echo $pid > "$FRONTEND_PID_FILE"

    # Wait a moment and verify it started
    sleep 2
    if ps -p $pid > /dev/null 2>&1; then
        echo -e "${GREEN}Frontend started (PID: $pid)${NC}"
        echo -e "  Log file: $FRONTEND_LOG"
    else
        echo -e "${RED}Failed to start frontend. Check log: $FRONTEND_LOG${NC}"
        return 1
    fi
}

# Stop backend server
stop_backend() {
    if is_running "$BACKEND_PID_FILE"; then
        local pid=$(cat "$BACKEND_PID_FILE")
        echo -e "${BLUE}Stopping backend (PID: $pid)...${NC}"
        kill $pid 2>/dev/null || true

        # Wait for process to stop
        local count=0
        while ps -p $pid > /dev/null 2>&1 && [ $count -lt 10 ]; do
            sleep 1
            count=$((count + 1))
        done

        # Force kill if still running
        if ps -p $pid > /dev/null 2>&1; then
            echo -e "${YELLOW}Force killing backend...${NC}"
            kill -9 $pid 2>/dev/null || true
        fi

        rm -f "$BACKEND_PID_FILE"
        echo -e "${GREEN}Backend stopped${NC}"
    else
        echo -e "${YELLOW}Backend is not running${NC}"
        rm -f "$BACKEND_PID_FILE"
    fi
}

# Stop frontend server
stop_frontend() {
    if is_running "$FRONTEND_PID_FILE"; then
        local pid=$(cat "$FRONTEND_PID_FILE")
        echo -e "${BLUE}Stopping frontend (PID: $pid)...${NC}"
        kill $pid 2>/dev/null || true

        # Wait for process to stop
        local count=0
        while ps -p $pid > /dev/null 2>&1 && [ $count -lt 10 ]; do
            sleep 1
            count=$((count + 1))
        done

        # Force kill if still running
        if ps -p $pid > /dev/null 2>&1; then
            echo -e "${YELLOW}Force killing frontend...${NC}"
            kill -9 $pid 2>/dev/null || true
        fi

        rm -f "$FRONTEND_PID_FILE"
        echo -e "${GREEN}Frontend stopped${NC}"
    else
        echo -e "${YELLOW}Frontend is not running${NC}"
        rm -f "$FRONTEND_PID_FILE"
    fi
}

# Show status
show_status() {
    echo -e "${BLUE}=== Server Status ===${NC}"
    echo ""

    if is_running "$BACKEND_PID_FILE"; then
        echo -e "Backend:  ${GREEN}Running${NC} (PID: $(cat $BACKEND_PID_FILE))"
    else
        echo -e "Backend:  ${RED}Stopped${NC}"
    fi

    if is_running "$FRONTEND_PID_FILE"; then
        echo -e "Frontend: ${GREEN}Running${NC} (PID: $(cat $FRONTEND_PID_FILE))"
    else
        echo -e "Frontend: ${RED}Stopped${NC}"
    fi

    echo ""
    echo "Log files:"
    echo "  Backend:  $BACKEND_LOG"
    echo "  Frontend: $FRONTEND_LOG"
}

# Tail logs
tail_logs() {
    local service="$1"

    case "$service" in
        backend|b)
            if [ -f "$BACKEND_LOG" ]; then
                tail -f "$BACKEND_LOG"
            else
                echo -e "${RED}No backend log file found${NC}"
            fi
            ;;
        frontend|f)
            if [ -f "$FRONTEND_LOG" ]; then
                tail -f "$FRONTEND_LOG"
            else
                echo -e "${RED}No frontend log file found${NC}"
            fi
            ;;
        all|""|a)
            echo -e "${BLUE}Tailing all logs (Ctrl+C to exit)...${NC}"
            if [ -f "$BACKEND_LOG" ] && [ -f "$FRONTEND_LOG" ]; then
                tail -f "$BACKEND_LOG" "$FRONTEND_LOG"
            else
                echo -e "${RED}Log files not found. Start the servers first.${NC}"
            fi
            ;;
        *)
            echo -e "${RED}Unknown service: $service${NC}"
            echo "Usage: $0 logs [backend|frontend|all]"
            ;;
    esac
}

# Main command handler
case "${1:-}" in
    start)
        start_backend
        start_frontend
        echo ""
        echo -e "${GREEN}=== Servers started ===${NC}"
        echo -e "Frontend: ${BLUE}http://localhost:3000${NC}"
        echo -e "Backend:  ${BLUE}http://localhost:8080${NC}"
        echo ""
        echo "Use '$0 logs' to view logs"
        echo "Use '$0 status' to check status"
        echo "Use '$0 stop' to stop servers"
        ;;
    stop)
        stop_frontend
        stop_backend
        echo ""
        echo -e "${GREEN}=== Servers stopped ===${NC}"
        ;;
    restart)
        echo -e "${BLUE}Restarting servers...${NC}"
        stop_frontend
        stop_backend
        echo ""
        start_backend
        start_frontend
        echo ""
        echo -e "${GREEN}=== Servers restarted ===${NC}"
        echo -e "Frontend: ${BLUE}http://localhost:3000${NC}"
        echo -e "Backend:  ${BLUE}http://localhost:8080${NC}"
        ;;
    status)
        show_status
        ;;
    logs)
        tail_logs "${2:-all}"
        ;;
    backend)
        case "${2:-}" in
            start) start_backend ;;
            stop) stop_backend ;;
            restart)
                stop_backend
                start_backend
                ;;
            logs) tail_logs backend ;;
            *)
                echo "Usage: $0 backend {start|stop|restart|logs}"
                exit 1
                ;;
        esac
        ;;
    frontend)
        case "${2:-}" in
            start) start_frontend ;;
            stop) stop_frontend ;;
            restart)
                stop_frontend
                start_frontend
                ;;
            logs) tail_logs frontend ;;
            *)
                echo "Usage: $0 frontend {start|stop|restart|logs}"
                exit 1
                ;;
        esac
        ;;
    *)
        echo "Qwen Code Web UI - Server Manager"
        echo ""
        echo "Usage: $0 {command} [options]"
        echo ""
        echo "Commands:"
        echo "  start           Start both backend and frontend servers"
        echo "  stop            Stop both servers"
        echo "  restart         Restart both servers"
        echo "  status          Show server status"
        echo "  logs [service]  Tail logs (service: backend|frontend|all, default: all)"
        echo ""
        echo "  backend {start|stop|restart|logs}   Manage backend only"
        echo "  frontend {start|stop|restart|logs}  Manage frontend only"
        echo ""
        echo "Examples:"
        echo "  $0 start              # Start all servers"
        echo "  $0 stop               # Stop all servers"
        echo "  $0 status             # Check status"
        echo "  $0 logs               # View all logs"
        echo "  $0 logs backend       # View backend logs only"
        echo "  $0 backend restart    # Restart backend only"
        exit 1
        ;;
esac