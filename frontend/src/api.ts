const GRAPHQL_URL = "http://localhost:5000/graphql";

export interface User {
  id: string;
  name: string;
  email: string;
  role: "REPORTER" | "AGENT";
}

export interface SLAInfo {
  firstResponseDueAt: string;
  resolutionDueAt: string;
  firstResponseState: "ON_TRACK" | "AT_RISK" | "BREACHED";
  resolutionState: "ON_TRACK" | "AT_RISK" | "BREACHED";
  firstResponseRemainingMinutes: number;
  resolutionRemainingMinutes: number;
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  createdAt: string;
  updatedAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  createdBy: User;
  assignedTo: User | null;
  sla: SLAInfo;
}

export interface Comment {
  id: string;
  content: string;
  createdAt: string;
  author: User;
}

export interface DashboardStats {
  totalTickets: number;
  openTickets: number;
  inProgressTickets: number;
  resolvedTickets: number;
  closedTickets: number;
  atRiskTickets: number;
  breachedTickets: number;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

class ApiClient {
  private getToken(): string | null {
    return localStorage.getItem("sla_tracker_token");
  }

  public setAuth(token: string, user: User) {
    localStorage.setItem("sla_tracker_token", token);
    localStorage.setItem("sla_tracker_user", JSON.stringify(user));
  }

  public clearAuth() {
    localStorage.removeItem("sla_tracker_token");
    localStorage.removeItem("sla_tracker_user");
  }

  public getCurrentUser(): User | null {
    const raw = localStorage.getItem("sla_tracker_user");
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  }

  private async gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
    });

    const json = (await response.json()) as GraphQLResponse<T>;

    if (json.errors && json.errors.length > 0) {
      const firstError = json.errors[0];
      throw new Error(firstError?.message ?? "GraphQL error");
    }

    if (!json.data) {
      throw new Error("No data returned from GraphQL");
    }

    return json.data;
  }

  // ==================== AUTH ====================

  public async login(email: string, password: string) {
    const data = await this.gql<{ login: { token: string; user: User } }>(`
      mutation Login($email: String!, $password: String!) {
        login(email: $email, password: $password) {
          token
          user { id name email role }
        }
      }
    `, { email, password });
    this.setAuth(data.login.token, data.login.user);
    return data.login;
  }

  public async register(name: string, email: string, password: string, role: string = "REPORTER") {
    const data = await this.gql<{ register: { token: string; user: User } }>(`
      mutation Register($name: String!, $email: String!, $password: String!, $role: UserRole) {
        register(name: $name, email: $email, password: $password, role: $role) {
          token
          user { id name email role }
        }
      }
    `, { name, email, password, role });
    this.setAuth(data.register.token, data.register.user);
    return data.register;
  }

  public async getUsers(role?: string): Promise<User[]> {
    const data = await this.gql<{ users: User[] }>(`
      query Users($role: UserRole) {
        users(role: $role) { id name email role }
      }
    `, role ? { role } : {});
    return data.users;
  }

  // ==================== DASHBOARD ====================

  public async getDashboard(): Promise<DashboardStats> {
    const data = await this.gql<{ dashboard: DashboardStats }>(`
      query {
        dashboard {
          totalTickets openTickets inProgressTickets resolvedTickets
          closedTickets atRiskTickets breachedTickets
        }
      }
    `);
    return data.dashboard;
  }

  // ==================== TICKETS ====================

  public async getTickets(params: {
    status?: string;
    priority?: string;
    slaState?: string;
    take?: number;
    cursor?: string;
  } = {}): Promise<{ nodes: Ticket[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } }> {
    const variables: Record<string, unknown> = {};
    if (params.status) variables.status = params.status;
    if (params.priority) variables.priority = params.priority;
    if (params.slaState) variables.slaState = params.slaState;
    if (params.take) variables.take = params.take;
    if (params.cursor) variables.cursor = params.cursor;

    const data = await this.gql<{ tickets: { nodes: Ticket[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } }>(`
      query Tickets($status: TicketStatus, $priority: Priority, $slaState: SLAState, $take: Int, $cursor: String) {
        tickets(status: $status, priority: $priority, slaState: $slaState, take: $take, cursor: $cursor) {
          nodes {
            id title description priority status
            createdAt updatedAt firstResponseAt resolvedAt
            createdBy { id name email role }
            assignedTo { id name email role }
            sla {
              firstResponseDueAt resolutionDueAt
              firstResponseState resolutionState
              firstResponseRemainingMinutes resolutionRemainingMinutes
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `, variables);
    return data.tickets;
  }

  public async getTicketById(id: string): Promise<Ticket & { comments: Comment[] }> {
    const data = await this.gql<{ ticket: Ticket & { comments: Comment[] } }>(`
      query Ticket($id: ID!) {
        ticket(id: $id) {
          id title description priority status
          createdAt updatedAt firstResponseAt resolvedAt
          createdBy { id name email role }
          assignedTo { id name email role }
          comments {
            id content createdAt
            author { id name email role }
          }
          sla {
            firstResponseDueAt resolutionDueAt
            firstResponseState resolutionState
            firstResponseRemainingMinutes resolutionRemainingMinutes
          }
        }
      }
    `, { id });
    return data.ticket;
  }

  public async createTicket(title: string, description: string, priority: string): Promise<Ticket> {
    const data = await this.gql<{ createTicket: Ticket }>(`
      mutation CreateTicket($title: String!, $description: String!, $priority: Priority!) {
        createTicket(title: $title, description: $description, priority: $priority) {
          id title description priority status createdAt updatedAt
          createdBy { id name email role }
          assignedTo { id name email role }
          sla {
            firstResponseDueAt resolutionDueAt
            firstResponseState resolutionState
            firstResponseRemainingMinutes resolutionRemainingMinutes
          }
        }
      }
    `, { title, description, priority });
    return data.createTicket;
  }

  public async changeTicketStatus(ticketId: string, status: string): Promise<Ticket> {
    const data = await this.gql<{ changeTicketStatus: Ticket }>(`
      mutation ChangeStatus($ticketId: ID!, $status: TicketStatus!) {
        changeTicketStatus(ticketId: $ticketId, status: $status) {
          id status resolvedAt
          sla {
            firstResponseDueAt resolutionDueAt
            firstResponseState resolutionState
            firstResponseRemainingMinutes resolutionRemainingMinutes
          }
        }
      }
    `, { ticketId, status });
    return data.changeTicketStatus;
  }

  public async assignTicket(ticketId: string, assigneeId: string): Promise<Ticket> {
    const data = await this.gql<{ assignTicket: Ticket }>(`
      mutation AssignTicket($ticketId: ID!, $assigneeId: ID!) {
        assignTicket(ticketId: $ticketId, assigneeId: $assigneeId) {
          id
          assignedTo { id name email role }
        }
      }
    `, { ticketId, assigneeId });
    return data.assignTicket;
  }

  public async resolveTicket(ticketId: string): Promise<Ticket> {
    const data = await this.gql<{ resolveTicket: Ticket }>(`
      mutation ResolveTicket($ticketId: ID!) {
        resolveTicket(ticketId: $ticketId) {
          id status resolvedAt
          sla {
            firstResponseDueAt resolutionDueAt
            firstResponseState resolutionState
            firstResponseRemainingMinutes resolutionRemainingMinutes
          }
        }
      }
    `, { ticketId });
    return data.resolveTicket;
  }

  public async addComment(ticketId: string, content: string): Promise<Comment> {
    const data = await this.gql<{ addComment: Comment }>(`
      mutation AddComment($ticketId: ID!, $content: String!) {
        addComment(ticketId: $ticketId, content: $content) {
          id content createdAt
          author { id name email role }
        }
      }
    `, { ticketId, content });
    return data.addComment;
  }
}

export const api = new ApiClient();
