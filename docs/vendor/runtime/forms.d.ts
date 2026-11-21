// Tipos do runtime forms.js (ajudam o autocompletar; não exigem TypeScript).

/** Alvo explícito: pelo nome completo do campo ou por seletor CSS. */
export type Target = { name: string | string[] } | { selector: string };

/** Valor de um campo no JSON. */
export type Value = string | number | boolean | string[] | null;

export type Data = { [key: string]: Value | Data };

export interface FieldError {
  field: string;
  message: string;
}

export type LiteralsKey = 'cpf' | 'cnpj' | 'cep' | 'phone' | 'mask';

export interface FormOptions {
  /**
   * Mantém os literais das máscaras no getData() (padrão true).
   * Pode ser por tipo: { cpf: false, phone: false, mask: true }.
   */
  literals?: boolean | Partial<Record<LiteralsKey, boolean>>;
  /**
   * JS dos componentes, carregado por ready() para cada <fieldset data-component>:
   * a pasta (padrão 'components/', relativa à página), uma função nome -> módulo
   * (ou a própria função do componente), ou false (ninguém é chamado).
   */
  components?: string | false | ((name: string) => unknown);
}

export interface ListContext {
  form: Form;
  field: Field;
  data: Data;
}

export type ListItem = string | { value: string | number; label?: string };

export interface ActionContext {
  form: Form;
  data: Data;
  button: HTMLButtonElement;
}

export type ActionResult = void | { errors: FieldError[] };

export interface ActionOptions {
  /** Texto do botão. Padrão: o nome ("gravar_rascunho" -> "Gravar rascunho"). */
  label?: string;
}

export interface ValidatorContext {
  form: Form;
  field: Field;
  readonly data: Data;
}

/** true (ou undefined) = válido; texto = mensagem de erro. */
export type Validator = (value: Value, ctx: ValidatorContext) => true | string | undefined;

export interface MaskTypeDef {
  validate?: Validator;
  /** Sobrescreve a opção `literals` para esta máscara. */
  literals?: boolean;
}

export type MessageKey =
  | 'required' | 'incomplete' | 'date' | 'time' | 'cpf' | 'cnpj' | 'email'
  | 'number' | 'digits' | 'min' | 'max' | 'invalid';

export interface ChangeDetail {
  field: string;
  value: Value;
  old: Value | undefined;
}

export interface EventDetails {
  ready: { form: Form };
  change: ChangeDetail;
  action: { action: string; data: Data };
  invalid: { errors: FieldError[] };
  error: { error: unknown; source: 'list' | 'action' | 'validator' | 'calc' | 'component' };
}

export class Form {
  constructor(target: string | HTMLFormElement, options?: FormOptions);
  readonly element: HTMLFormElement;

  /** Provedor de uma lista (data-list). Sem registro, a lista não é tocada. Sem cache. */
  list(name: string, fn: (ctx: ListContext) => ListItem[] | Promise<ListItem[]>): this;
  /**
   * Ação da página: vira um botão da barra [data-buttons], na ordem do registro
   * (a primeira é a principal). Nada é validado automaticamente.
   */
  action(name: string, fn: (ctx: ActionContext) => ActionResult | Promise<ActionResult>, options?: ActionOptions): this;
  /** A parte que um componente incluiu (ex.: 'residencial'), para o JS do componente. */
  scope(prefix?: string): Part;
  /** Validador síncrono; vários por campo; aparece só o primeiro erro. */
  validator(target: Target, fn: Validator): this;
  /** Campo calculado (fica somente leitura). Dependências pelo nome completo. */
  calcField(name: string, deps: string[], fn: (...values: Value[]) => Value): this;
  /** Validação (e literais) para todos os campos com esta data-mask. */
  maskType(mask: string, def: MaskTypeDef): this;
  messages(map: Partial<Record<MessageKey, string>>): this;
  /** Escuta um evento fm:*; devolve a função que cancela a escuta. */
  on<K extends keyof EventDetails>(event: K, fn: (detail: EventDetails[K], e: CustomEvent) => void): () => void;
  on<K extends keyof EventDetails>(event: K, target: Target, fn: (detail: EventDetails[K], e: CustomEvent) => void): () => void;

  /** Chama o JS dos componentes, liga máscaras e botões e carrega as listas. Registre tudo antes. */
  ready(): Promise<this>;
  destroy(): void;

  getData(): Data;
  setData(data: Data, options?: { clear?: boolean }): this;
  clear(): this;
  validate(options?: { target?: Target; focus?: boolean }): { valid: boolean; errors: FieldError[] };
  showErrors(errors: FieldError[]): this;
  readOnly(flag?: boolean): this;
  reloadList(target?: Target): Promise<void>;
  field(name: string): Field | null;
  fields(target?: Target): Field[];
}

/**
 * Parte do formulário (form.scope): o que o JS de um componente recebe. Nomes
 * relativos ({ name: 'cep' } = 'residencial.cep'); { selector } e listas só
 * dentro dela. Não tem action(): os botões são da página.
 */
export class Part {
  readonly prefix: string;
  /** Provedor da lista só para os campos desta parte (vence o do formulário). */
  list(name: string, fn: (ctx: ListContext) => ListItem[] | Promise<ListItem[]>): this;
  validator(target: Target, fn: Validator): this;
  calcField(name: string, deps: string[], fn: (...values: Value[]) => Value): this;
  maskType(mask: string, def: MaskTypeDef): this;
  on<K extends keyof EventDetails>(event: K, fn: (detail: EventDetails[K], e: CustomEvent) => void): () => void;
  on<K extends keyof EventDetails>(event: K, target: Target, fn: (detail: EventDetails[K], e: CustomEvent) => void): () => void;
  field(name: string): Field | null;
  fields(target?: Target): Field[];
  reloadList(target?: Target): Promise<void>;
  validate(options?: { target?: Target; focus?: boolean }): { valid: boolean; errors: FieldError[] };
  /** O objeto desta parte no JSON. */
  getData(): Data;
  setData(data: Data, options?: { clear?: boolean }): this;
  clear(): this;
  readOnly(flag?: boolean): this;
  scope(name: string): Part;
}

export class Field {
  readonly form: Form;
  readonly name: string;
  readonly kind: 'input' | 'select' | 'radio' | 'checks' | 'check';
  readonly elements: Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;
  /** O controle, ou o fieldset no caso de grupos de opções. */
  readonly element: HTMLElement;
  /** Valor normalizado (o mesmo do JSON). Atribuir formata e dispara fm:change. */
  value: Value;
  /** Texto exibido. */
  readonly text: string;
  /** data-mask */
  mask: string | null;
  required: boolean;
  enabled: boolean;
  readOnly: boolean;
  visible: boolean;
  /** data-min / data-max (números). */
  min: number | null;
  max: number | null;
  /** Mensagem de erro exibida; '' limpa. */
  error: string;
}

/** Data aceita pelas funções de data: valor de campo ('aaaa-mm-dd'), 'dd/mm/aaaa' ou Date. */
export type DateLike = string | Date | null | undefined;

/**
 * Diferença entre datas. Com uma data, até hoje; com duas, fim − início
 * (negativa se o fim vier antes). Faltando uma das datas: null.
 */
export type DateDiff = (start: DateLike, end?: DateLike) => number | null;

/** Agrega os números dos argumentos (arrays são abertos); null só sem nenhum número. */
export type Aggregate = (...values: unknown[]) => number | null;

/** Funções prontas para listas e campos calculados (utils.js). */
export declare const utils: {
  /** Provedor de lista que lê um JSON; url relativa à página, ou função do contexto. */
  loadJson(url: string | ((ctx: ListContext) => string)): (ctx: ListContext) => Promise<ListItem[]>;
  /** Anos completos (trunca). */
  dateDiffYears: DateDiff;
  /** Anos com fração do ano em curso. */
  dateDiffYearsFrac: DateDiff;
  /** Meses completos (trunca). */
  dateDiffMonths: DateDiff;
  /** Meses com fração do mês em curso. */
  dateDiffMonthsFrac: DateDiff;
  /** Dias. */
  dateDiffDays: DateDiff;
  sum: Aggregate;
  avg: Aggregate;
  min: Aggregate;
  max: Aggregate;
};
