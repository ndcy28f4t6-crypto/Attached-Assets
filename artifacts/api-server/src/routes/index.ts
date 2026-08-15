import { Router, type IRouter } from "express";
import healthRouter from "./health";
import calendarRouter from "./calendar";
import appRouter from "./app";

const router: IRouter = Router();

router.use(healthRouter);
router.use(calendarRouter);
router.use(appRouter);

export default router;
