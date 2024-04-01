import Todo, { TodoProps } from "../models/Todo";
import postgres from "postgres";
import Request from "../router/Request";
import Response, { StatusCode } from "../router/Response";
import Router from "../router/Router";
import { createUTCDate } from "../utils";

/**
 * Controller for handling Todo CRUD operations.
 * Routes are registered in the `registerRoutes` method.
 * Each method should be called when a request is made to the corresponding route.
 */
export default class TodoController {
	private sql: postgres.Sql<any>;

	constructor(sql: postgres.Sql<any>) {
		this.sql = sql;
	}

	/**
	 * To register a route, call the corresponding method on
	 * the router instance based on the HTTP method of the route.
	 *
	 * @param router Router instance to register routes on.
	 *
	 * @example router.get("/todos", this.getTodoList);
	 */
	registerRoutes(router: Router) {
		router.get("/todos", this.getTodoList);
		router.post("/todos", this.createTodo);

		// Any routes that include a `:id` parameter should be registered last.
		router.get("/todos/:id", this.getTodo);
		router.put("/todos/:id", this.updateTodo);
		router.del("/todos/:id", this.deleteTodo);
		router.put("/todos/:id/complete", this.completeTodo);
	}

	/**
	 * Part 1: This method should be called when a GET request is made to /todos.
	 * It should retrieve all todos from the database and send them as a response.
	 * Part 2: This method should also support filtering and sorting. The status
	 * of the todos should be filterable using a query parameter `status` and
	 * the todos should be sortable using the query parameters `sortBy` and `sortOrder`.
	 *
	 * @param req The request object.
	 * @param res The response object.
	 *
	 * @example GET /todos
	 * @example GET /todos?status=complete
	 * @example GET /todos?sortBy=createdAt&sortOrder=ASC
	 */
	getTodoList = async (req: Request, res: Response) => {
		const queryParams = req.getSearchParams();

		const statusFilter = queryParams.get("status") as
			| TodoProps["status"]
			| undefined;
		const sortBy = queryParams.get("sortBy") ?? "id";
		const orderBy = queryParams.get("orderBy") ?? "asc";
		let todos: Todo[] = [];

		if (
			statusFilter &&
			statusFilter !== "incomplete" &&
			statusFilter !== "complete"
		) {
			await res.send({
				statusCode: StatusCode.BadRequest,
				message: "Invalid filter parameter.",
			});
			return;
		}

		if (sortBy && !this.isSortByValid(sortBy)) {
			await res.send({
				statusCode: StatusCode.BadRequest,
				message: "Invalid sortBy parameter.",
			});
			return;
		}

		if (orderBy && !this.isOrderByValid(orderBy)) {
			await res.send({
				statusCode: StatusCode.BadRequest,
				message: "Invalid orderBy parameter.",
			});
			return;
		}

		try {
			todos = await Todo.readAll(
				this.sql,
				{ status: statusFilter },
				sortBy,
				orderBy,
			);
		} catch (error) {
			const message = `Error while getting todo list: ${error}`;
			console.error(message);
			await res.send({
				statusCode: StatusCode.InternalServerError,
				message,
			});
		}

		await res.send({
			statusCode: StatusCode.OK,
			message: "Todo list retrieved",
			payload: {
				todos: todos.map((todo) => todo.props),
			},
		});
	};

	/**
	 * This method should be called when a GET request is made to /todos/:id.
	 * It should retrieve a single todo from the database and send it as a response.
	 *
	 * @param req The request object.
	 * @param res The response object.
	 *
	 * @example GET /todos/1
	 */
	getTodo = async (req: Request, res: Response) => {
		const id = req.getId();

		if (isNaN(id)) {
			await res.send({
				statusCode: StatusCode.BadRequest,
				message: "Invalid ID",
			});
			return;
		}

		let todo: Todo | null = null;

		try {
			todo = await Todo.read(this.sql, id);
		} catch (error) {
			const message = `Error while getting todo list: ${error}`;
			console.error(message);
			await res.send({
				statusCode: StatusCode.InternalServerError,
				message,
			});
		}

		if (todo) {
			await res.send({
				statusCode: StatusCode.OK,
				message: "Todo retrieved",
				payload: { todo: todo.props },
			});
		} else {
			await res.send({
				statusCode: StatusCode.NotFound,
				message: "Not found",
			});
		}
	};

	/**
	 * This method should be called when a POST request is made to /todos.
	 * It should create a new todo in the database and send it as a response.
	 *
	 * @param req The request object.
	 * @param res The response object.
	 *
	 * @example POST /todos { "title": "New Todo", "description": "A new todo" }
	 */
	createTodo = async (req: Request, res: Response) => {
		let todo: Todo | null = null;
		let todoProps: TodoProps = {
			title: req.body.title,
			description: req.body.description,
			status: "incomplete",
			createdAt: createUTCDate(),
		};

		if (req.body.dueAt) {
			todoProps.dueAt = createUTCDate(new Date(req.body.dueAt));
		}

		try {
			todo = await Todo.create(this.sql, todoProps);
		} catch (error) {
			console.error("Error while creating todo:", error);
		}

		if (!todo) {
			await res.send({
				statusCode: StatusCode.InternalServerError,
				message: "Error while creating todo",
			});
			return;
		}

		await res.send({
			statusCode: StatusCode.Created,
			message: "Todo created successfully!",
			payload: { todo: todo.props },
		});
	};

	/**
	 * This method should be called when a PUT request is made to /todos/:id.
	 * It should update an existing todo in the database and send it as a response.
	 *
	 * @param req The request object.
	 * @param res The response object.
	 *
	 * @example PUT /todos/1 { "title": "Updated title" }
	 * @example PUT /todos/1 { "description": "Updated description" }
	 * @example PUT /todos/1 { "title": "Updated title", "dueAt": "2022-12-31" }
	 */
	updateTodo = async (req: Request, res: Response) => {
		const id = req.getId();

		if (isNaN(id)) {
			await res.send({
				statusCode: StatusCode.BadRequest,
				message: "Invalid ID",
			});
			return;
		}

		const todoProps: Partial<TodoProps> = {};

		if (req.body.title) {
			todoProps.title = req.body.title;
		}

		if (req.body.description) {
			todoProps.description = req.body.description;
		}

		if (req.body.dueAt) {
			todoProps.dueAt = createUTCDate(new Date(req.body.dueAt));
		}

		try {
			const todo = await Todo.read(this.sql, id);
			if (todo) {
				await todo.update(todoProps);
				await res.send({
					statusCode: StatusCode.OK,
					message: "Todo updated successfully!",
					payload: { todo: todo.props },
				});
			} else {
				await res.send({
					statusCode: StatusCode.NotFound,
					message: "Not found",
				});
			}
		} catch (error) {
			console.error("Error while updating todo:", error);
		}
	};

	/**
	 * This method should be called when a DELETE request is made to /todos/:id.
	 * It should delete an existing todo from the database.
	 *
	 * @param req The request object.
	 * @param res The response object.
	 *
	 * @example DELETE /todos/1
	 */
	deleteTodo = async (req: Request, res: Response) => {
		const id = req.getId();

		if (isNaN(id)) {
			await res.send({
				statusCode: StatusCode.BadRequest,
				message: "Invalid ID",
			});
			return;
		}

		try {
			const todo = await Todo.read(this.sql, id);
			if (!todo) {
				await res.send({
					statusCode: StatusCode.NotFound,
					message: "Not found",
				});
				return;
			}

			if (await todo.delete()) {
				await res.send({
					statusCode: StatusCode.OK,
					message: "Todo deleted successfully!",
					payload: { todo: todo.props },
				});
			} else {
				await res.send({
					statusCode: StatusCode.InternalServerError,
					message: "Error while deleting todo.",
				});
			}
		} catch (error) {
			console.error("Error while deleting todo:", error);
		}
	};

	/**
	 * This method should be called when a PUT request is made to /todos/:id/complete.
	 * It should mark an existing todo as complete in the database and send it as a response.
	 *
	 * @param req The request object.
	 * @param res The response object.
	 *
	 * @example PUT /todos/1/complete
	 */
	completeTodo = async (req: Request, res: Response) => {
		const id = req.getId();

		if (isNaN(id)) {
			await res.send({
				statusCode: StatusCode.BadRequest,
				message: "Invalid ID",
			});
			return;
		}

		try {
			const todo = await Todo.read(this.sql, id);
			if (todo) {
				await todo.markComplete();
				await res.send({
					statusCode: StatusCode.OK,
					message: "Todo marked as complete!",
					payload: { todo: todo.props },
				});
			} else {
				await res.send({
					statusCode: StatusCode.NotFound,
					message: "Not found",
				});
			}
		} catch (error) {
			console.error("Error while marking todo as complete:", error);
		}
	};

	/**
	 * This is something called a type guard. It's a function that checks if a
	 * given object is of a certain type. If the object is of that type, the
	 * function returns true, otherwise it returns false. This is useful for
	 * checking if the request body is a valid TodoProps object.
	 * @param props Must be `any` type because we don't know what the request body will be.
	 * @returns Whether or not the given object is a valid TodoProps object.
	 * @see https://www.typescriptlang.org/docs/handbook/2/narrowing.html#using-type-predicates
	 */
	isValidTodoProps = (props: any): props is TodoProps => {
		return (
			props.hasOwnProperty("title") &&
			props.hasOwnProperty("description") &&
			typeof props.title === "string" &&
			typeof props.description === "string"
		);
	};

	isSortByValid = (sortBy: string | undefined): boolean => {
		return (
			sortBy === "id" ||
			sortBy === "title" ||
			sortBy === "description" ||
			sortBy === "dueAt" ||
			sortBy === "createdAt" ||
			sortBy === "updatedAt"
		);
	};

	isOrderByValid = (orderBy: string | undefined): boolean => {
		return orderBy === "asc" || orderBy === "desc";
	};
}
