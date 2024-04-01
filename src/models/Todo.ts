import postgres from "postgres";
import {
	camelToSnake,
	convertToCase,
	createUTCDate,
	snakeToCamel,
} from "../utils";

export interface TodoProps {
	id?: number;
	title: string;
	description: string;
	status: "incomplete" | "complete";
	dueAt?: Date;
	createdAt: Date;
	completedAt?: Date;
	editedAt?: Date;
}

export default class Todo {
	constructor(
		private sql: postgres.Sql<any>,
		public props: TodoProps,
	) {}

	static async create(sql: postgres.Sql<any>, props: TodoProps) {
		// const [row] = await sql<TodoProps[]>`
		// 	INSERT INTO todos
		// 		(title, description, due_at, created_at)
		// 	VALUES
		// 		(${props.title}, ${props.description}, ${props.dueAt}, ${props.createdAt})
		// 	RETURNING *
		// `;

		const connection = await sql.reserve();

		props.createdAt = props.createdAt ?? createUTCDate();

		const [row] = await connection<TodoProps[]>`
			INSERT INTO todos
				${sql(convertToCase(camelToSnake, props))}
			RETURNING *
		`;

		await connection.release();

		return new Todo(sql, convertToCase(snakeToCamel, row) as TodoProps);
	}

	static async read(sql: postgres.Sql<any>, id: number) {
		const connection = await sql.reserve();

		const [row] = await connection<TodoProps[]>`
			SELECT * FROM
			todos WHERE id = ${id}
		`;

		await connection.release();

		if (!row) {
			return null;
		}

		return new Todo(sql, convertToCase(snakeToCamel, row) as TodoProps);
	}

	static async readAll(
		sql: postgres.Sql<any>,
		filters?: Partial<TodoProps>,
		sortBy?: string,
		orderBy?: string,
	): Promise<Todo[]> {
		const connection = await sql.reserve();

		const getSortBy = (sortBy: string) => {
			switch (sortBy) {
				case "title":
					return sql`title`;
				case "description":
					return sql`description`;
				case "status":
					return sql`status`;
				case "dueAt":
					return sql`due_at`;
				case "createdAt":
					return sql`created_at`;
				case "completedAt":
					return sql`completed_at`;
				case "editedAt":
					return sql`edited_at`;
				default:
					return sql`id`;
			}
		};

		const getOrderBy = (orderBy: string) => {
			return orderBy === "asc" ? sql`ASC` : sql`DESC`;
		};

		const rows = await connection<TodoProps[]>`
			SELECT *
			FROM todos
			${filters?.status ? sql`WHERE status = ${filters.status}` : sql``}
			${sortBy ? sql`ORDER BY ${getSortBy(sortBy)}` : sql``}
			${orderBy ? sql`${getOrderBy(orderBy)}` : sql``}
		`;

		await connection.release();

		return rows.map(
			(row) =>
				new Todo(sql, convertToCase(snakeToCamel, row) as TodoProps),
		);
	}

	async update(updateProps: Partial<TodoProps>) {
		const connection = await this.sql.reserve();

		const [row] = await connection`
			UPDATE todos
			SET
				${this.sql(convertToCase(camelToSnake, updateProps))}, edited_at = ${createUTCDate()}
			WHERE
				id = ${this.props.id}
			RETURNING *
		`;

		await connection.release();

		this.props = { ...this.props, ...convertToCase(snakeToCamel, row) };
	}

	async delete() {
		const connection = await this.sql.reserve();

		const result = await connection`
			DELETE FROM todos
			WHERE id = ${this.props.id}
		`;

		await connection.release();

		return result.count === 1;
	}

	async markComplete() {
		await this.update({
			status: "complete",
			completedAt: createUTCDate(),
		});
	}
}
